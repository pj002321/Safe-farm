"""AI 질의응답 진입점.

지금은 검증된 질문을 그대로 돌려주기만 한다 — 검색·생성은 아직 없다.
`status.py` 가 미구현 기능을 `false` 로 정직하게 알리는 것과 같은 이유로,
되지도 않는 답변 생성을 흉내내지 않는다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.knowledge.retriever import retrieve_with_score
from app.schemas.ask import AskRequest,AskMatch,AskResponse

router = APIRouter(prefix="/v1", tags=["ask"])

@router.post("/ask",
dependencies=[Depends(require_service_token)])
def ask(request: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
    """질문과 가까운 조각을 벡터 검색해 돌려준다.

    require_service_token 은 "Next.js 서버가 보냈는가"만 확인한다
    어떤 회원이 물었는지는 이 함수도, 그 의존성도 모른다. 회원 단위 처리(대화
    이력, 사용량 제한)가 필요해지면 그때 요청 모양에 사용자 식별자를 추가한다.
    """
    matches = retrieve_with_score(db, request.question)
    return AskResponse(
        matches=[AskMatch(body=chunk.body, distance=dist) for chunk, dist in matches]
        )