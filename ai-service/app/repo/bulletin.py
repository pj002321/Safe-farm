"""게시물 표(`pest_bulletins`·`disaster_bulletins`) 조회. **쿼리만 한다.**

두 표 다 작물을 `crop_names` 한 칸에 쉼표로 이어 둔다('감자,당근,더덕,마늘…').
거기서 한 작물을 찾는 방법이 **두 곳에서 같아야 한다.**

★ 2026-09-19 — `like '%' || crop || '%'` 로 했다가 **'배' 가 '배추' 에 걸렸다.**
  과수 밭에 배추 무름병이 갔다. 양끝에 쉼표를 붙여 토막째 비교하면 안 걸린다.
  같은 조건을 두 쿼리에 베껴 두면 한쪽만 고쳐 이 버그가 반쯤 살아난다.
"""

from __future__ import annotations

from datetime import date
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

#: `crop_names` 에 `:crop` 이 **토막으로** 들어 있나. 바인드 이름은 `crop` 이다.
#:
#: ⚠ 부분 일치(`like '%배%'`)로 바꾸지 말 것. 위 ★ 의 버그가 그대로 돌아온다.
_CROP_IN_NAMES = "',' || crop_names || ',' like '%,' || :crop || ',%'"


def disaster_hazards_for(db: Session, crop_name_ko: str, month: int, phases: Sequence[str]):
    """
    # summary
    이 작물·이 달의 재해 대비 문구(`disaster_bulletins`). 재해 하나당 최신 한 건.

    # params
    db: 세션<br>
    crop_name_ko: 작물 한글명<br>
    month: 대비할 달(1~12)<br>
    phases: 고를 `phase` 값들(예: 사전대책·발생전)<br>

    # returns
    (hazard, body) 행 목록. 재해명 오름차순

    # examples
        disaster_hazards_for(db, "배추", 10, ["사전대책"])
        -> [("가을가뭄", "…배수구를 깊게 정비하여…")]
    """
    return db.execute(
        text(f"""
            select distinct on (hazard) hazard, body
              from disaster_bulletins
             where issue_month = :m
               and crop_names <> ''
               and {_CROP_IN_NAMES}
               and phase = any(:phases)
             order by hazard, bulletin_id
        """),
        {"m": month, "crop": crop_name_ko, "phases": list(phases)},
    ).all()


def pest_bulletins_for(
    db: Session,
    crop_name_ko: str,
    levels: Sequence[str],
    today: date,
    limit: int,
):
    """
    # summary
    이 작물에 `today`(월·일) 기준 발생 구간이 걸리는 병해충(`pest_bulletins`).

    ⚠ 연도는 안 본다 — 절기(월·일)만 맞춘다. `period_from`~`period_to` 가
      `today` 를 감싸는 행만 고른다.

    # params
    db: 세션<br>
    crop_name_ko: 작물 한글명<br>
    levels: 고를 `level` 값들(예: 주의보·경보)<br>
    today: 기준 날짜. 연도는 안 쓰고 월·일만 본다<br>
    limit: 최대 행 수(추리기 전 원자료 기준)<br>

    # returns
    (pest_name, level) 행 목록. 병해충명 오름차순

    # examples
        pest_bulletins_for(db, "고추", ["주의보", "경보"], date(2026, 8, 1), 12)
        -> [("담배나방", "주의보"), ...]
    """
    return db.execute(
        text(f"""
            select distinct pest_name, level
              from pest_bulletins
             where crop_names <> ''
               and {_CROP_IN_NAMES}
               and level = any(:levels)
               and (extract(month from period_from), extract(day from period_from))
                   <= (:m, :d)
               and (extract(month from period_to), extract(day from period_to))
                   >= (:m, :d)
             order by pest_name
             limit :lim
        """),
        {
            "crop": crop_name_ko,
            "levels": list(levels),
            "m": today.month,
            "d": today.day,
            "lim": limit,
        },
    ).all()
