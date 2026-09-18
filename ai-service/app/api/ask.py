"""AI 질의응답 진입점.

질문을 벡터 검색 → 리랭크 → 근거 조각으로 LLM 답변을 생성한다.
직전 대화 몇 턴도 프롬프트에 붙인다(app/domain/history_context.py).
질문마다 ask_history 에 한 행을 남긴다 — 이력 열람은 프런트가 Supabase RLS 로
직접 읽고, 여기서는 쓰기와 일일 한도 계산만 한다. DB 쿼리 자체는
app/service/ask_history.py 에 있다 — 이 파일은 그걸 부르기만 한다.
"""
from __future__ import annotations

import json
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import DAILY_ASK_LIMIT
from app.core.db import get_db
from app.core.security import require_service_token
from app.domain.ask_suggest import suggest_questions
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.domain.history_context import HISTORY_RULE
from app.graph.graph import graph as ask_graph
from app.graph.state import GraphState
from app.models.farm.ask_history import AskHistory
from app.schemas.ask import (
    AskFeedbackRequest,
    AskMatch,
    AskQuota,
    AskRequest,
    AskResponse,
    AskSuggestions,
)
from app.service.ask_context import plot_focus
from app.service.ask_history import (
    complete_answer,
    recent_turns,
    record_question,
    submit_feedback,
    today_ask_count,
)

router = APIRouter(prefix="/v1", tags=["ask"])

DAILY_LIMIT_MESSAGE = (
    f"오늘 질문 가능 횟수({DAILY_ASK_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해 주세요."
)

STREAM_FAILED_MESSAGE = "답변을 만드는 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요."


def _quota(db: Session, user_id: uuid.UUID) -> AskQuota:
    """지금 시점의 잔여 횟수. 부르는 자리에 따라 '쓰기 전'과 '쓴 뒤'가 갈리므로
    값을 캐시하지 않고 그때그때 센다.
    """
    used = today_ask_count(db, user_id)
    return AskQuota(limit=DAILY_ASK_LIMIT, used=used, remaining=max(0, DAILY_ASK_LIMIT - used))


def _event(name: str, payload: object) -> str:
    """SSE 한 덩어리. data 는 항상 JSON 이라 프런트가 한 가지 방법으로만 파싱한다."""
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse(
    history: AskHistory,
    graph_state: GraphState,
    db: Session,
    quota: AskQuota,
) -> Iterator[str]:
    """meta → matches → 토큰 → done 순으로 흘려보낸다. ask-flow 그래프(app/graph/graph.py)를
    직접 스트리밍으로 돌린다 — stream_mode=["updates", "custom"] 로 "retrieve" 노드가
    끝난 시점의 matches 와 "generate" 노드가 get_stream_writer 로 흘리는 토큰
    (app/graph/nodes.py 의 generate 참고)을 같이 받는다. retrieve 가 generate 보다
    먼저 끝나므로 matches 이벤트가 토큰보다 먼저 나가는 순서는 그대로 유지된다.

    meta 가 맨 앞인 이유는 프런트가 history_id 를 먼저 받아야 피드백을 보낼 대상을
    알고, 잔여 횟수를 곧바로 줄여 보여줄 수 있어서다.

    스트림이 끝나면 전체 답변을 ask_history 에 채운다 — 토큰마다 커밋하면 DB 왕복이
    토큰 수만큼 늘어난다.

    그래프 실행 중 예외(plan/retrieve 의 DB 오류 포함)가 나면 error 이벤트를 보낸다.
    조용히 끝내면 프런트는 짧은 답변을 정상 완료로 읽는다. 여기까지 온 질문은 이미
    한 번 차감됐으므로 받은 데까지는 이력에 남긴다.
    """
    yield _event("meta", {"historyId": str(history.id), "quota": quota.model_dump()})

    parts: list[str] = []
    try:
        for mode, chunk in ask_graph.stream(graph_state, stream_mode=["updates", "custom"]):
            if mode == "custom":
                parts.append(chunk["piece"])
                yield _event("token", chunk["piece"])
                continue
            output = chunk.get("retrieve")
            if output is not None:
                matches = [
                    AskMatch(body=c.body, distance=dist, source_title=c.document.title)
                    for c, dist in output["matches"]
                ]
                yield _event("matches", [m.model_dump() for m in matches])
    except Exception:  # noqa: BLE001 — 원인별 분기가 없다. 어느 쪽이든 화면이 할 일은 같다
        complete_answer(db, history, "".join(parts))
        yield _event("error", STREAM_FAILED_MESSAGE)
        return

    complete_answer(db, history, "".join(parts))
    yield _event("done", True)


@router.post("/ask",
dependencies=[Depends(require_service_token)], response_model=None)
def ask(request: AskRequest, db: Session = Depends(get_db)) -> AskResponse | StreamingResponse:
    """질문과 가까운 조각을 벡터 검색해 근거로 LLM 답변을 생성한다.

    require_service_token 은 "Next.js 서버가 보냈는가"만 확인한다. user_id 는
    Next.js 가 세션 쿠키로 이미 확인한 값을 실어 보낸다고 신뢰한다 — 여기서 다시
    인증하지 않는다.
    """
    quota = _quota(db, request.user_id)
    if quota.remaining <= 0:
        return AskResponse(matches=[], message=DAILY_LIMIT_MESSAGE, quota=quota)

    if is_blocked_topic(request.question):
        # 차단은 한도를 깎는다. 깎지 않으면 금지어를 섞어 한도 없이 두드릴 수 있다.
        history = record_question(db, request.user_id, request.question, message=BLOCKED_MESSAGE)
        return AskResponse(
            matches=[],
            message=BLOCKED_MESSAGE,
            history_id=str(history.id),
            quota=_quota(db, request.user_id),
        )

     # 이력을 **이번 질문을 남기기 전에** 읽는다. 뒤로 미루면 방금 한 질문이
    # 자기 자신의 맥락으로 딸려 들어간다.
    history_context = HISTORY_RULE(recent_turns(db, request.user_id))

    # plan(밭 조회 필요 여부)부터 retrieve·generate 까지 그래프가 전부 맡는다 —
    # ask_graph.stream(..., stream_mode=["updates", "custom"]) 이 노드 완료 이벤트와
    # generate 의 토큰을 같이 내보내므로 _sse 안에서 그대로 그래프를 돌린다
    # (app/graph/nodes.py 의 generate 주석 참고).
    graph_state: GraphState = {
        "db": db,
        "question": request.question,
        "user_id": request.user_id,
        "plot_id": request.plot_id,
        "history_context": history_context,
    }

    history = record_question(db, request.user_id, request.question)
    quota = _quota(db, request.user_id)

    return StreamingResponse(
        _sse(history, graph_state, db, quota),
        media_type="text/event-stream",
    )


@router.get("/ask/quota", dependencies=[Depends(require_service_token)])
def ask_quota(
    user_id: uuid.UUID = Query(...), db: Session = Depends(get_db)
) -> AskQuota:
    """오늘 남은 질문 횟수. 화면이 묻기 전에 보여주고 0 이면 입력을 막는다.

    막는 건 화면 편의일 뿐이고 실제 차단은 `ask()` 가 한다 — 프런트를 거치지 않는
    호출도 같은 한도를 받아야 하기 때문이다.
    """
    return _quota(db, user_id)


@router.get("/ask/suggestions", dependencies=[Depends(require_service_token)])
def ask_suggestions(
    user_id: uuid.UUID = Query(...),
    plot_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
) -> AskSuggestions:
    """초기 화면에 띄울 추천 질문 3건.

    plot_id 가 없거나, 남의 밭이거나, 그 밭에 기르는 작물이 없으면 작물 이름 없는
    일반 질문이 나간다 — 빈 화면을 내놓는 것보다 낫고, 사용자가 밭을 고르면 곧바로
    바뀐다.

    user_id 가 필수인 이유는 추천 질문에 작물 이름과 생육단계가 그대로 박히기
    때문이다. 소유 확인 없이 만들면 남의 밭에 무엇이 심겼는지가 이 응답으로 샌다.
    """
    focus = plot_focus(db, plot_id, user_id) if plot_id else None
    if focus is None:
        return AskSuggestions(questions=suggest_questions(None, None))

    basis = focus.crop_name
    if focus.stage_name is not None:
        basis = f"{focus.crop_name} · {focus.stage_name}"
    return AskSuggestions(
        questions=suggest_questions(focus.crop_name, focus.stage_name),
        basis=basis,
    )


@router.post("/ask/{history_id}/feedback", dependencies=[Depends(require_service_token)])
def ask_feedback(
    history_id: uuid.UUID, body: AskFeedbackRequest, db: Session = Depends(get_db)
) -> dict[str, bool]:
    """답변 하나에 up/down 평가와 사유를 남긴다. history_id·user_id 가 둘 다 맞는 행에만
    통한다 — 다른 회원의 질문에 평가를 남기는 걸 막는다.

    사유는 돌려주지 않는다. 자유 입력이라 개인정보가 섞일 수 있고, 화면이 다시 읽을
    이유도 없다(20260917100000_ask_feedback_reason.sql 의 컬럼 grant 와 같은 방침).
    """
    if not submit_feedback(db, history_id, body.user_id, body.rating, body.reason):
        raise HTTPException(status_code=404, detail="해당 이력을 찾을 수 없습니다.")
    return {"ok": True}
