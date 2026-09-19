"""작물이 상하기 시작하는 온도. `crop_disaster_rules` 에서 읽는다.

★ 2026-09-19 — 이 표는 93행이 적재돼 있는데 **작물 상세 화면(app/repo/crop.py)
  에서만** 읽혔다. 홈·리포트·카드 어디에도 안 닿았다.

  `crop_stages.stage_hazards` 가 "이 시기에 저온 피해가 잦다" 는 **시기**를 말하고,
  이 표가 "몇 도부터" 라는 **한계값**을 준다. 둘에 예보를 곱하면 물 카드와 같은
  구조가 된다 — 시기 × 한계 × 사정.

⚠ **단계별 규칙은 쓰지 않는다.** 규칙의 `stage_name` 은 '꽃필 때'·'개화착과기-
  수확기' 인데 우리 `crop_stages.stage_name` 은 '생육기'·'결구기' 다. **어휘가
  달라 맞출 수 없다.** 억지로 이으면 엉뚱한 단계의 한계값이 붙는다 —
  고추가 '꽃필 때' 15도인데 모기를 때에 그 값을 쓰면 9월 내내 경고가 뜬다.
  작물 전체에 걸린 규칙만 쓰고, 단계 어휘를 맞추는 일은 마스터 쪽 몫으로 남긴다.

⚠ `ta_avg`(일평균) 규칙도 뺀다. 우리가 들고 있는 예보는 최저·최고뿐이다.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class TempLimits:
    """이 작물이 상하기 시작하는 온도. 모르면 None — 그러면 카드가 안 나간다."""

    #: 아침 최저가 이 아래로 내려가면 언다·상한다(도)
    frost_c: float | None = None
    #: 낮 최고가 이 위로 올라가면 상한다(도)
    heat_c: float | None = None


def temp_limits_for(db: Session, crop_name_ko: str) -> TempLimits:
    """작물 전체에 걸린 한계 온도. 규칙이 없으면 빈 값이다.

    ⚠ 여러 규칙이 있으면 **먼저 걸리는 쪽**을 고른다 — 저온은 가장 높은 값,
      고온은 가장 낮은 값이다. 늦게 알리느니 일찍 알린다. 다만 '동해'(-10도)
      처럼 극단값과 '저온'(15도)이 섞여 있어, 고르지 않으면 영영 안 걸린다.
    """
    row = db.execute(
        text("""
            select
              max(r.threshold_c) filter (where r.metric = 'ta_min' and r.op = 'lte') as frost,
              min(r.threshold_c) filter (where r.metric = 'ta_max' and r.op = 'gte') as heat
              from crop_disaster_rules r
              join crops c on c.crop_id = r.crop_id
             where c.name = :crop
               and coalesce(r.stage_name, '') = ''
        """),
        {"crop": crop_name_ko},
    ).first()
    if row is None:
        return TempLimits()
    return TempLimits(
        frost_c=float(row.frost) if row.frost is not None else None,
        heat_c=float(row.heat) if row.heat is not None else None,
    )
