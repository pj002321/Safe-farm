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
from app.knowledge.retriever import retrieve_with_score
from app.knowledge.vector_store import neighbors
from app.domain.ask_suggest import suggest_questions
from app.domain.diversity import diversify
from app.schemas.ask import AskFeedbackRequest, AskMatch, AskRequest, AskResponse, NO_MATCH_DISTANCE
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.domain.history_context import HISTORY_RULE
from app.knowledge.generator import stream_answer
from app.knowledge.reranker import rerank
from app.knowledge.retriever import retrieve_with_score
from app.models.farm.ask_history import AskHistory
from app.schemas.ask import (
    NO_MATCH_DISTANCE,
    AskFeedbackRequest,
    AskMatch,
    AskQuota,
    AskRequest,
    AskResponse,
    AskSuggestions,
)
from app.service.ask_context import build_plot_context, plot_focus
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

# 후보를 넓게 받아 소스 상한을 걸고 TOP_K 개를 고른다. 값의 근거는 pipeline/doc/golden.py 주석 참고
# (2026-09-17 실측 33문항: 후보 10→5 hit 24·hint 27, 후보 50→소스≤2→5 hit 29·hint 29, 잃은 문항 0).
# 두 파일의 세 값은 항상 같아야 한다 — 어긋나면 골든에서 좋아져도 실제 답변은 그대로다
CANDIDATES = 50   # 벡터에서 받는 후보. 정답이 22위·39위에 있었다. 20·30 은 +1 에 그친다
PER_SOURCE = 2    # 앞에 둘 같은 소스 수. 1 은 근거 둘이 한 소스에 있는 질문을 잃는다(칩 2개 사태)
TOP_K = 5


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
    matches: list[AskMatch],
    tokens: Iterator[str],
    db: Session,
    quota: AskQuota,
) -> Iterator[str]:
    """meta → matches → 토큰 → done 순으로 흘려보낸다.

    meta 가 맨 앞인 이유는 프런트가 history_id 를 먼저 받아야 피드백을 보낼 대상을
    알고, 잔여 횟수를 곧바로 줄여 보여줄 수 있어서다.

    스트림이 끝나면 전체 답변을 ask_history 에 채운다 — 토큰마다 커밋하면 DB 왕복이
    토큰 수만큼 늘어난다.

    LLM 호출이 중간에 끊기면 error 이벤트를 보낸다. 조용히 끝내면 프런트는 짧은
    답변을 정상 완료로 읽는다. 여기까지 온 질문은 이미 한 번 차감됐으므로 받은
    데까지는 이력에 남긴다.
    """
    yield _event("meta", {"historyId": str(history.id), "quota": quota.model_dump()})
    yield _event("matches", [m.model_dump() for m in matches])

    parts: list[str] = []
    try:
        for token in tokens:
            parts.append(token)
            yield _event("token", token)
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

    # 후보 CANDIDATES 개를 받아 같은 소스는 PER_SOURCE 개까지 앞에 두고 TOP_K 개를 고른다.
    # 넘친 것은 버리지 않고 뒤로 민다 — 버리면 후보가 한 소스뿐인 질문에서 근거가 2개로 준다.
    # 후보 10 이면 "고추 물 언제 줘야 해?" 의 정답 crop_guide(22위)를 볼 기회조차 없다.
    # rerank 는 이제 고르지 않고 TOP_K 개의 순서만 잡는다 — 풀 8에서 고르게 하면 hit 을 하나 깎았다
    candidates = retrieve_with_score(db, request.question, CANDIDATES)
    picked = diversify(
        candidates, key=lambda m: m[0].document.source, per_key=PER_SOURCE, limit=TOP_K
    )
    matches = rerank(request.question, picked)
    found = [(chunk, dist) for chunk, dist in matches if dist < NO_MATCH_DISTANCE]

    history = record_question(db, request.user_id, request.question)
    quota = _quota(db, request.user_id)

    if not found:
        return AskResponse(matches=[], history_id=str(history.id), quota=quota)

    ask_matches = [
        AskMatch(body=chunk.body, distance=dist, source_title=chunk.document.title)
        for chunk, dist in found
    ]
    # ⚠️ user_id 를 반드시 넘긴다. build_plot_context 는 이걸로 **소유를 확인**하고,
    #    남의 밭이면 None 을 돌려준다. 빠뜨리면 TypeError 로 /ask 가 통째로 500 이
    #    되는데, 파이썬이라 import 시점에 안 잡히고 실제 질문이 들어와야 드러난다
    #    (운영에서 그렇게 터졌다).
    plot_context = (
        build_plot_context(db, request.plot_id, request.user_id)
        if request.plot_id
        else None
    )
    # 뽑힌 조각의 같은 문서 앞뒤 조각을 LLM 에만 더 준다. 출처 칩(ask_matches)은 5개 그대로 —
    # "방울토마토 물" 의 정답은 뽑힌 조각의 바로 옆 조각이었다 — 골든 hint 29→31.
    # hit 은 같은 소스라 안 움직인다
    evidence = found + neighbors(db, found)
    return StreamingResponse(
        _sse(
            history,
            ask_matches,
            stream_answer(request.question, evidence, plot_context),
            db,
            quota,
        ),
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
