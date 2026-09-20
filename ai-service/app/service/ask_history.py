"""ask_history 를 만지는 DB 로직. app/api/ask.py 는 이 함수들을 부르기만 한다.

map.py 가 app/service/gdd_region.py·warn_region.py 를 쓰는 것과 같은 자리 — 라우터에
쿼리를 직접 쓰지 않는다.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.domain.history_context import HISTORY_TURNS, Turn
from app.models.farm.ask_history import AskHistory
from app.repo.ask_history import add as add_question
from app.repo.ask_history import count_since, recent_answered, set_feedback

#: 몇 분 안의 질문까지 같은 대화로 볼지. `ask_history` 에 세션 컬럼이 없어
#: 시간으로 근사한다 — 없으면 어제 물어본 것이 오늘 질문의 맥락으로 끼어든다.
SESSION_WINDOW_MINUTES = 30


def today_ask_count(db: Session, user_id: uuid.UUID) -> int:
    """이 사용자가 오늘(UTC 자정 기준) 보낸 질문 수. 일일 한도 계산용."""
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return count_since(db, user_id, start_of_day)


def record_question(
    db: Session, user_id: uuid.UUID, question: str, message: str | None = None
) -> AskHistory:
    """질문 한 건을 이력에 남긴다. message 가 있으면(가드레일 차단 등) 그걸로 답을 대신한다."""
    history = add_question(db, user_id, question, message)
    db.commit()
    return history


def complete_answer(db: Session, history: AskHistory, answer: str) -> None:
    """스트리밍이 끝난 뒤 전체 답변을 이력에 채운다."""
    history.answer = answer
    db.commit()


def submit_feedback(
    db: Session,
    history_id: uuid.UUID,
    user_id: uuid.UUID,
    rating: str,
    reason: str | None = None,
) -> bool:
    """history_id·user_id 가 둘 다 맞는 행에만 평가를 남긴다. 갱신됐으면 True.

    reason 은 안 보냈으면(None) 기존 값을 건드리지 않는다. 평가만 바꾸러 온 요청이
    앞서 적어 둔 사유를 지우면 안 되기 때문이다. 지우고 싶으면 빈 문자열을 보낸다.
    """
    values: dict[str, str | None] = {"rating": rating}
    if reason is not None:
        cleaned = reason.strip()
        values["feedback_reason"] = cleaned or None

    updated = set_feedback(db, history_id, user_id, values)
    db.commit()
    return bool(updated)


def recent_turns(
    db: Session,
    user_id: uuid.UUID,
    limit: int = HISTORY_TURNS,
    within_minutes: int = SESSION_WINDOW_MINUTES,
) -> list[Turn]:
    """이 사용자의 최근 대화 몇 턴. 프롬프트에 붙일 맥락의 재료다.

    **자기 이력만 본다** — user_id 로 거르지 않으면 남의 질문이 답변 맥락으로 샌다.

    가드레일에 막힌 건(message 가 채워진 행)은 뺀다. 주제 밖이라 되돌려 봐야
    맥락이 흐려지고, 차단 문구가 지난 답변인 것처럼 읽힌다.

    돌려주는 순서는 **오래된 것이 앞**이다. 조회는 최신순으로 해야 인덱스
    (ix_ask_history_user_created)를 타므로, 뒤집는 건 여기서 한다.
    """
    since = datetime.now(timezone.utc) - timedelta(minutes=within_minutes)
    rows = recent_answered(db, user_id, since, limit)
    return [Turn(question=row.question, answer=row.answer) for row in reversed(rows)]
