"""품종 카탈로그 조회. **쿼리만 한다 — 가공은 service 가 한다.**

돌려주는 것은 ORM 객체 그대로다. dict 로 바꾸는 것은 이 층의 일이 아니다
(AGENTS.md: repo 는 쿼리만, domain 은 가공만, 둘을 합치는 것은 service).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.farm import Variety


def varieties_of(db: Session, crop_name: str | None) -> list[Variety]:
    """
    # summary
    품종 목록을 가져온다. 밭 등록 화면의 품종 선택지가 이 목록이다.

    # params
    db: 세션<br>
    crop_name: 작물 이름으로 거른다. None 이면 전체(43작물 2,599품종)<br>

    # returns
    이름순 Variety 목록

    # examples
        [v.name for v in varieties_of(db, '고추')]  -> ['원강7호', ...]
    """
    stmt = select(Variety).order_by(Variety.name)
    if crop_name:
        stmt = stmt.where(Variety.crop_name == crop_name)
    return list(db.scalars(stmt))


def variety_by_no(db: Session, variety_no: str) -> Variety | None:
    """
    # summary
    품종 번호 하나로 찾는다. 품종 상세 화면이 쓴다.

    # params
    db: 세션<br>
    variety_no: 농사로 cntntsNo. varieties 의 자연키이자 PK<br>

    # returns
    Variety 하나. 없으면 None

    # examples
        variety_by_no(db, '268123')  -> Variety(원강7호)
    """
    return db.get(Variety, variety_no)
