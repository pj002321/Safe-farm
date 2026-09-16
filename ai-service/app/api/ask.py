"""AI 질의응답 진입점.

질문을 벡터 검색 → 리랭크 → 근거 조각으로 LLM 답변을 생성한다.
"""
from __future__ import annotations
import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.knowledge.retriever import retrieve_with_score
from app.schemas.ask import AskRequest,AskMatch,AskResponse,NO_MATCH_DISTANCE
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.knowledge.generator import stream_answer
from app.knowledge.reranker import rerank

router = APIRouter(prefix="/v1", tags=["ask"])

def _sse(matches: list[AskMatch], tokens: Iterator[str]) -> Iterator[str]:
    """matches 를 먼저 한 번 이벤트로 보내고, 그다음 토큰을 오는 대로 흘려보낸다.
    프론트가 matches(출처 칩)를 답변 완성 전에 먼저 그릴 수 있게 순서를 이렇게 둔다.
    """
    yield f"event: matches\ndata: {json.dumps([m.model_dump() for m in matches], ensure_ascii=False)}\n\n"
    for token in tokens:
        yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"

@router.post("/ask",
dependencies=[Depends(require_service_token)], response_model=None)
def ask(request: AskRequest, db: Session = Depends(get_db)) -> AskResponse | StreamingResponse:
    """질문과 가까운 조각을 벡터 검색해 근거로 LLM 답변을 생성한다.

    require_service_token 은 "Next.js 서버가 보냈는가"만 확인한다
    어떤 회원이 물었는지는 이 함수도, 그 의존성도 모른다. 회원 단위 처리(대화
    이력, 사용량 제한)가 필요해지면 그때 요청 모양에 사용자 식별자를 추가한다.
    """
    if is_blocked_topic(request.question):
        return AskResponse(matches=[], message=BLOCKED_MESSAGE)

    matches = rerank(request.question, retrieve_with_score(db, request.question))
    found = [(chunk, dist) for chunk, dist in matches if dist < NO_MATCH_DISTANCE]
    if not found:
        return AskResponse(matches=[])

    ask_matches = [
        AskMatch(body=chunk.body, distance=dist, source_title=chunk.document.title)
        for chunk, dist in found
    ]
    return StreamingResponse(
        _sse(ask_matches, stream_answer(request.question, found)),
        media_type="text/event-stream",
    )



