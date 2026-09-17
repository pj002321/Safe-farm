"""AI 질의응답 진입점.

질문을 벡터 검색 → 리랭크 → 근거 조각으로 LLM 답변을 생성한다.
질문마다 ask_history 에 한 행을 남긴다 — 이력 열람은 프런트가 Supabase RLS 로
직접 읽고, 여기서는 쓰기와 일일 한도 계산만 한다. DB 쿼리 자체는
app/service/ask_history.py 에 있다 — 이 파일은 그걸 부르기만 한다.
"""
from __future__ import annotations

import json
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import DAILY_ASK_LIMIT
from app.core.db import get_db
from app.core.security import require_service_token
from app.knowledge.retriever import retrieve_with_score
from app.knowledge.vector_store import neighbors
from app.domain.diversity import diversify
from app.schemas.ask import AskFeedbackRequest, AskMatch, AskRequest, AskResponse, NO_MATCH_DISTANCE
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.knowledge.generator import stream_answer
from app.knowledge.reranker import rerank
from app.models.farm.ask_history import AskHistory
from app.service.ask_context import build_plot_context
from app.service.ask_history import complete_answer, record_question, submit_feedback, today_ask_count

router = APIRouter(prefix="/v1", tags=["ask"])

DAILY_LIMIT_MESSAGE = f"오늘 질문 가능 횟수({DAILY_ASK_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해 주세요."

# 후보를 넓게 받아 소스 상한을 걸고 TOP_K 개를 고른다. 값의 근거는 pipeline/doc/golden.py 주석 참고
# (2026-09-17 실측 33문항: 후보 10→5 hit 24·hint 27, 후보 50→소스≤2→5 hit 29·hint 29, 잃은 문항 0).
# 두 파일의 세 값은 항상 같아야 한다 — 어긋나면 골든에서 좋아져도 실제 답변은 그대로다
CANDIDATES = 50   # 벡터에서 받는 후보. 정답이 22위·39위에 있었다. 20·30 은 +1 에 그친다
PER_SOURCE = 2    # 앞에 둘 같은 소스 수. 1 은 근거 둘이 한 소스에 있는 질문을 잃는다(칩 2개 사태)
TOP_K = 5


def _sse(history: AskHistory, matches: list[AskMatch], tokens: Iterator[str], db: Session) -> Iterator[str]:
    """history_id → matches → 토큰 순으로 흘려보낸다. 프론트가 history_id 를 먼저 받아야
    피드백을 보낼 대상을 안다. 스트림이 끝나면 전체 답변을 ask_history 에 채운다 —
    토큰마다 커밋하면 DB 왕복이 토큰 수만큼 늘어난다.
    """
    yield f"event: history\ndata: {json.dumps(str(history.id))}\n\n"
    yield f"event: matches\ndata: {json.dumps([m.model_dump() for m in matches], ensure_ascii=False)}\n\n"
    parts: list[str] = []
    for token in tokens:
        parts.append(token)
        yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"
    complete_answer(db, history, "".join(parts))


@router.post("/ask",
dependencies=[Depends(require_service_token)], response_model=None)
def ask(request: AskRequest, db: Session = Depends(get_db)) -> AskResponse | StreamingResponse:
    """질문과 가까운 조각을 벡터 검색해 근거로 LLM 답변을 생성한다.

    require_service_token 은 "Next.js 서버가 보냈는가"만 확인한다. user_id 는
    Next.js 가 세션 쿠키로 이미 확인한 값을 실어 보낸다고 신뢰한다 — 여기서 다시
    인증하지 않는다.
    """
    if today_ask_count(db, request.user_id) >= DAILY_ASK_LIMIT:
        return AskResponse(matches=[], message=DAILY_LIMIT_MESSAGE)

    if is_blocked_topic(request.question):
        history = record_question(db, request.user_id, request.question, message=BLOCKED_MESSAGE)
        return AskResponse(matches=[], message=BLOCKED_MESSAGE, history_id=str(history.id))

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

    if not found:
        return AskResponse(matches=[], history_id=str(history.id))

    ask_matches = [
        AskMatch(body=chunk.body, distance=dist, source_title=chunk.document.title)
        for chunk, dist in found
    ]
    plot_context = build_plot_context(db, request.plot_id) if request.plot_id else None
    # 뽑힌 조각의 같은 문서 앞뒤 조각을 LLM 에만 더 준다. 출처 칩(ask_matches)은 5개 그대로 —
    # "방울토마토 물" 의 정답은 뽑힌 조각의 바로 옆 조각이었다 — 골든 hint 29→31.
    # hit 은 같은 소스라 안 움직인다
    evidence = found + neighbors(db, found)
    return StreamingResponse(
        _sse(history, ask_matches, stream_answer(request.question, evidence, plot_context), db),
        media_type="text/event-stream",
    )


@router.post("/ask/{history_id}/feedback", dependencies=[Depends(require_service_token)])
def ask_feedback(
    history_id: uuid.UUID, body: AskFeedbackRequest, db: Session = Depends(get_db)
) -> dict[str, bool]:
    """답변 하나에 up/down 평가를 남긴다. history_id·user_id 가 둘 다 맞는 행에만 통한다
    — 다른 회원의 질문에 평가를 남기는 걸 막는다.
    """
    if not submit_feedback(db, history_id, body.user_id, body.rating):
        raise HTTPException(status_code=404, detail="해당 이력을 찾을 수 없습니다.")
    return {"ok": True}


