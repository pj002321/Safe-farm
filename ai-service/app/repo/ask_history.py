"""질문 이력(`farm.ask_history`) 조회·쓰기. **쿼리만 한다.**

한도·세션 창·Turn 변환 같은 판정은 `service/ask_history.py` 가 한다. 여기는 어떤
행을 건드릴지만 정한다.

⚠ **커밋하지 않는다.** `/ask` 는 "질문 기록 → 스트리밍 → 답변 채우기"가 한 요청
  안에서 시점을 나눠 일어나는데, 커밋 시점을 repo 가 쥐면 그 순서를 service 가
  못 정한다.

⚠ **`user_id` 를 뺀 조회를 여기에 만들지 않는다.** 남의 질문이 답변 맥락으로 새는
  경로가 된다. 이력은 사용자별로만 읽는다.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.farm.ask_history import AskHistory


def count_since(db: Session, user_id: uuid.UUID, since: datetime) -> int:
    """
    # summary
    이 사용자가 `since` 이후 보낸 질문 수. 일일 한도 계산용이다.

    행을 세는 데 `count(*)` 를 쓴다. 한도 검사는 요청마다 도는데 행을 전부 올려
    `len()` 을 잡으면 질문을 많이 한 사용자일수록 느려진다 — 정확히 반대다.

    # params
    db: 세션<br>
    user_id: 사용자 id<br>
    since: 기준 시각. **어디서 자를지는 부르는 쪽이 정한다**(UTC 자정인지 24시간
    전인지는 정책이지 쿼리가 아니다)<br>

    # returns
    개수

    # examples
        count_since(db, user_id, 오늘_UTC_자정)  -> 7
    """
    return (
        db.scalar(
            select(func.count())
            .select_from(AskHistory)
            .where(AskHistory.user_id == user_id, AskHistory.created_at >= since)
        )
        or 0
    )


def add(db: Session, user_id: uuid.UUID, question: str, message: str | None) -> AskHistory:
    """
    # summary
    질문 한 건을 이력에 넣는다. **flush 도 commit 도 하지 않는다.**

    # params
    db: 세션<br>
    user_id: 사용자 id<br>
    question: 사용자가 보낸 원문<br>
    message: 답변을 대신하는 안내 문구(가드레일 차단 등). 없으면 None<br>

    # returns
    아직 DB 에 안 들어간 AskHistory. 부르는 쪽이 커밋해야 id 가 생긴다

    # examples
        history = add(db, user_id, "지금 물 줘야 하나요?", None); db.commit()
    """
    history = AskHistory(user_id=user_id, question=question, message=message)
    db.add(history)
    return history


def set_feedback(
    db: Session, history_id: uuid.UUID, user_id: uuid.UUID, values: dict
) -> int:
    """
    # summary
    `history_id` **와** `user_id` 가 둘 다 맞는 행만 갱신한다. 갱신된 행 수를 준다.

    ⚠ user_id 조건을 빼지 말 것. history_id 는 브라우저가 보낸 값이라, 거르지
      않으면 남의 답변에 평가를 남길 수 있다.

    # params
    db: 세션<br>
    history_id: 이력 id. 믿지 않는다<br>
    user_id: Next 가 세션 쿠키로 확인해 실어 보낸 값<br>
    values: 채울 칼럼. **무엇을 채울지는 service 가 정한다** — 사유를 안 보낸
    요청이 기존 사유를 지우지 않게 하는 건 정책이라 여기서 판단하지 않는다<br>

    # returns
    갱신된 행 수. 0 이면 없는 이력이거나 남의 이력이다. **둘을 구분하지 않는다**

    # examples
        set_feedback(db, history_id, user_id, {"rating": "up"})  -> 1
    """
    return db.execute(
        update(AskHistory)
        .where(AskHistory.id == history_id, AskHistory.user_id == user_id)
        .values(**values)
    ).rowcount or 0


def recent_answered(
    db: Session, user_id: uuid.UUID, since: datetime, limit: int
) -> list[AskHistory]:
    """
    # summary
    이 사용자의 `since` 이후 이력 중 **답변까지 간 것**을 최신순으로 `limit` 건.

    가드레일에 막힌 건(`message` 가 채워진 행)은 뺀다. 주제 밖이라 되돌려 봐야
    맥락이 흐려지고, 차단 문구가 지난 답변인 것처럼 읽힌다.

    # params
    db: 세션<br>
    user_id: 사용자 id<br>
    since: 이 시각 이후. 대화 세션의 길이는 service 가 정한다<br>
    limit: 최대 건수<br>

    # returns
    AskHistory 목록. **최신이 앞이다** — 그래야 인덱스
    (`ix_ask_history_user_created`)를 탄다. 시간순으로 읽고 싶으면 부르는 쪽이
    뒤집는다

    # examples
        [h.question for h in recent_answered(db, uid, 30분_전, 3)]  -> ['가장 최근', ...]
    """
    return list(
        db.scalars(
            select(AskHistory)
            .where(
                AskHistory.user_id == user_id,
                AskHistory.created_at >= since,
                AskHistory.message.is_(None),
            )
            .order_by(AskHistory.created_at.desc())
            .limit(limit)
        )
    )
