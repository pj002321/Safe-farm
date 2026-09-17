"""ask_history 를 만지는 DB 로직. app/api/ask.py 는 이 함수들을 부르기만 한다.

map.py 가 app/service/gdd_region.py·warn_region.py 를 쓰는 것과 같은 자리 — 라우터에
쿼리를 직접 쓰지 않는다.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.farm.ask_history import AskHistory


def today_ask_count(db: Session, user_id: uuid.UUID) -> int:
    """이 사용자가 오늘(UTC 자정 기준) 보낸 질문 수. 일일 한도 계산용."""
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(AskHistory)
        .filter(AskHistory.user_id == user_id, AskHistory.created_at >= start_of_day)
        .count()
    )


def record_question(
    db: Session, user_id: uuid.UUID, question: str, message: str | None = None
) -> AskHistory:
    """질문 한 건을 이력에 남긴다. message 가 있으면(가드레일 차단 등) 그걸로 답을 대신한다."""
    history = AskHistory(user_id=user_id, question=question, message=message)
    db.add(history)
    db.commit()
    return history


def complete_answer(db: Session, history: AskHistory, answer: str) -> None:
    """스트리밍이 끝난 뒤 전체 답변을 이력에 채운다."""
    history.answer = answer
    db.commit()


def submit_feedback(db: Session, history_id: uuid.UUID, user_id: uuid.UUID, rating: str) -> bool:
    """history_id·user_id 가 둘 다 맞는 행에만 평가를 남긴다. 갱신됐으면 True."""
    updated = (
        db.query(AskHistory)
        .filter(AskHistory.id == history_id, AskHistory.user_id == user_id)
        .update({"rating": rating})
    )
    db.commit()
    return bool(updated)
