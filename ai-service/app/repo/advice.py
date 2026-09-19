"""LLM 결과 캐시(`farm.advices` · `farm.farm_advices`) 조회. **쿼리만 한다.**

두 표는 같은 일을 한다 — **하루 한 번만 LLM 을 부르기 위한 자물쇠 겸 저장소**다.
`advices` 는 재배 건 하나의 리포트, `farm_advices` 는 사용자 한 명의 밭 총평이다.

⚠ **쓰기는 여기 두지 않았다.** 넣는 쪽은 `input_snapshot` 에 dataclass 를 JSON 으로
  말아 넣는데, 무엇을 스냅샷으로 남길지는 리포트의 사정이라 service 가 쥔다.
  여기서는 "오늘 것이 있나"만 본다.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.farm import Advice, FarmAdvice


def advice_on(db: Session, cultivation_id: uuid.UUID, advice_date: date) -> Advice | None:
    """
    # summary
    재배 건 하나의 그날치 리포트 캐시. 없으면 None(= LLM 을 불러야 한다).

    # params
    db: 세션<br>
    cultivation_id: 재배 건 id<br>
    advice_date: 날짜. **오늘을 여기서 정하지 않는다** — 날짜 경계는 호출부가
    쥐어야 테스트에서 어제·내일을 넣어 볼 수 있다<br>

    # returns
    Advice 또는 None

    # examples
        advice_on(db, cultivation_id, date.today()) is None  -> True  # 첫 조회
    """
    return db.scalars(
        select(Advice).where(
            Advice.cultivation_id == cultivation_id,
            Advice.advice_date == advice_date,
        )
    ).first()


def farm_advice_on(db: Session, user_id: uuid.UUID, advice_date: date) -> FarmAdvice | None:
    """
    # summary
    사용자 한 명의 그날치 밭 총평 캐시. 없으면 None.

    # params
    db: 세션<br>
    user_id: 사용자 id<br>
    advice_date: 날짜<br>

    # returns
    FarmAdvice 또는 None

    # examples
        farm_advice_on(db, user_id, date.today()).summary  -> '오늘은 ...'
    """
    return db.scalars(
        select(FarmAdvice).where(
            FarmAdvice.user_id == user_id,
            FarmAdvice.advice_date == advice_date,
        )
    ).first()


def add_advice(
    db: Session,
    cultivation_id: uuid.UUID,
    advice_date: date,
    summary: str,
    todos: list[str],
    cautions: list[str],
    input_snapshot: dict,
) -> Advice:
    """
    # summary
    그날치 리포트를 캐시에 넣는다. **commit 하지 않는다.**

    `input_snapshot` 을 같이 남기는 이유는 나중에 "이 답이 왜 이렇게 나왔나"를
    되짚기 위해서다. 그날의 기상·생육 입력이 없으면 LLM 답만 남아 검증할 수 없다.

    # params
    db: 세션<br>
    cultivation_id: 재배 건 id<br>
    advice_date: 날짜<br>
    summary: 두세 문장 요약<br>
    todos: 할 일 목록<br>
    cautions: 주의 목록. **DB 칼럼 이름은 `warnings` 다** — 여기서 이름을 맞춘다<br>
    input_snapshot: JSON 으로 직렬화가 끝난 입력. 말아 넣는 건 service 의 일이다<br>

    # returns
    아직 DB 에 안 들어간 Advice

    # examples
        add_advice(db, cid, date.today(), "...", [...], [...], snap); db.commit()
    """
    advice = Advice(
        cultivation_id=cultivation_id,
        advice_date=advice_date,
        summary=summary,
        todos=todos,
        warnings=cautions,
        input_snapshot=input_snapshot,
    )
    db.add(advice)
    return advice


def add_farm_advice(
    db: Session,
    user_id: uuid.UUID,
    advice_date: date,
    summary: str,
    input_snapshot: list,
) -> FarmAdvice:
    """
    # summary
    그날치 밭 총평을 캐시에 넣는다. **commit 하지 않는다.**

    # params
    db: 세션<br>
    user_id: 사용자 id<br>
    advice_date: 날짜<br>
    summary: 총평 문장<br>
    input_snapshot: 밭별 입력을 JSON 으로 직렬화한 목록<br>

    # returns
    아직 DB 에 안 들어간 FarmAdvice

    # examples
        add_farm_advice(db, uid, date.today(), "...", snaps); db.commit()
    """
    advice = FarmAdvice(
        user_id=user_id,
        advice_date=advice_date,
        summary=summary,
        input_snapshot=input_snapshot,
    )
    db.add(advice)
    return advice
