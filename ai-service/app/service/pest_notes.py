"""이맘때 이 작물에 자주 나오는 병해충. `pest_bulletins` 에서 읽는다.

★ 2026-09-19 — 이 표는 1,197행이 적재돼 있는데 **읽는 코드가 하나도 없었다.**
  모델만 있고 아무도 안 썼다. 기르는 작물 14종이 전부 걸린다(실측).

⚠ **"지금 발생 중" 이 아니라 "이맘때 자주 나오는" 이다.** 자료가 2023~2026년
  발생정보라, 올해 지금 그 병해충이 돌고 있다는 뜻이 아니다. 연도를 안 보고
  **월·일만** 본다 — 절기가 같으면 나오는 것도 비슷하기 때문이다.
  문장을 만드는 쪽(task_rules)이 이 선을 지킨다.

⚠ 등급이 '예비' 인 것은 뺀다. 주의보·경보만 쓴다 — 예비까지 넣으면 고추 한
  작물에 여섯 줄이 되고, 그러면 무엇을 살펴야 하는지가 아니라 "많구나" 만 남는다.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.domain.pest_names import merge_pest_names
from app.service.bulletin_sql import CROP_IN_NAMES

#: 쓸 등급. 표에 있는 값은 셋뿐이다 — 예보 827 · 주의보 350 · 경보 20(실측).
#:
#: ⚠ '예보' 는 뺀다. 넣으면 고추 한 작물이 아홉 줄이 되고, 그러면 무엇을 살펴야
#:   하는지가 아니라 "많구나" 만 남는다.
#: ⚠ official_alerts 의 등급말('주의'·'예비')과 **어휘가 다르다.** 한때 그 말을
#:   여기 섞어 뒀는데, 표에 없는 값이라 아무 일도 안 하는 죽은 항목이었다.
_LEVELS = ("주의보", "경보")

#: 한 작물에서 훑어볼 최대 줄 수. 추리기(merge_pest_names) 전의 원자료 기준이다.
_SCAN_LIMIT = 12


def pest_names_for(db: Session, crop_name_ko: str, today: date | None = None) -> tuple[str, ...]:
    """이 작물에 이맘때 나온 병해충 이름 몇 개. 없으면 빈 튜플이다.

    ⚠ 작물명은 `crop_names` 안에 쉼표로 이어져 있다('감자,당근,더덕,마늘…').
      **토막째 맞춘다** — 부분 일치로 했더니 '배' 가 '배추' 에 걸려 과수 밭에
      배추 병해충이 갔다. 정규화된 연결표가 생기면 그때 조인으로 바꾼다.
    """
    오늘 = today or date.today()
    rows = db.execute(
        text(f"""
            select distinct pest_name, level
              from pest_bulletins
             where crop_names <> ''
               and {CROP_IN_NAMES}
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
            "levels": list(_LEVELS),
            "m": 오늘.month,
            "d": 오늘.day,
            "lim": _SCAN_LIMIT,
        },
    ).all()
    return merge_pest_names([r.pest_name for r in rows])
