"""작물 마스터를 화면이 쓸 모양으로 묶는다.

repo 는 평평한 목록을 주고(작물 13 · 숙기 21 · 단계 71 · 규칙 58), 이 파일이
작물 → 숙기 → 단계 로 엮는다. api 는 여기서 받은 dict 를 그대로 내보낸다.

⚠ **ORM 객체를 밖으로 내보내지 않는다.** 세션이 닫히면 접근이 깨지고,
  api·schemas 가 DB 모델을 알게 된다. gdd_region 도 같은 규칙이다.

⚠ **Numeric 컬럼은 Decimal 로 온다.** base_temp 가 Decimal('5.0') 이다.
  JSON 으로 못 나가므로 여기서 float 로 바꾼다 — api 가 할 일이 아니다.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.repo.crop import (
    all_crops,
    crops_by_name,
    disaster_rules_of,
    stages_of,
    variants_of,
)


def _num(v: Decimal | float | None) -> float | None:
    """Decimal → float. 없으면 None 그대로."""
    return float(v) if v is not None else None


def crop_list(db: Session) -> list[dict]:
    """
    # summary
    작물 목록. 밭 등록 화면의 선택지다. 숙기·단계는 읽지 않는다.

    # params
    db: 세션<br>

    # returns
    이름순 dict 목록. 13작물이 들어 있다

    # examples
        crop_list(db)
        -> [{'name': '감자', 'base_temp': 5.0, 'upper_temp': 30.0, 'difficulty': '중'}, ...]
    """
    return [
        {
            "name": c.name,
            "base_temp": _num(c.base_temp),
            "upper_temp": _num(c.upper_temp),
            "difficulty": c.difficulty,
        }
        for c in all_crops(db)
    ]


def crop_detail(db: Session, names: list[str]) -> list[dict]:
    """
    # summary
    작물의 숙기·생육단계·재해규칙까지 묶어서 돌려준다. 리포트 화면이 쓴다.

    ⚠ 이름을 **목록으로** 받는다. 한 밭에 작물이 여럿이라(plots.crops 가 배열)
      하나씩 부르면 쿼리가 작물 수만큼 늘어난다.

    # params
    db: 세션<br>
    names: 작물 이름들. 없는 이름은 결과에서 빠진다<br>

    # returns
    작물 dict 목록. 각 dict 에 variants(숙기)와 disaster_rules 가 들어 있고,
    variants 안에 stages 가 들어 있다. 찾은 것만 돌려주므로 names 보다 짧을 수 있다

    # examples
        crop_detail(db, ['배추'])
        -> [{'name': '배추', ..., 'variants': [{'maturity_type': 'MID',
              'gdd_target': 742, 'stages': [...]}], 'disaster_rules': [...]}]
    """
    crops = crops_by_name(db, names)
    if not crops:
        return []

    crop_ids = [c.crop_id for c in crops]
    variants = variants_of(db, crop_ids)
    stages = stages_of(db, [v.variant_id for v in variants])
    rules = disaster_rules_of(db, crop_ids)

    # 부모 id 로 묶어 둔다. 아래에서 O(1) 로 찾는다
    stage_by_variant: dict[int, list] = {}
    for s in stages:
        stage_by_variant.setdefault(s.variant_id, []).append(s)

    variant_by_crop: dict[int, list] = {}
    for v in variants:
        variant_by_crop.setdefault(v.crop_id, []).append(v)

    rule_by_crop: dict[int, list] = {}
    for r in rules:
        rule_by_crop.setdefault(r.crop_id, []).append(r)

    return [
        {
            "name": c.name,
            "base_temp": _num(c.base_temp),
            "upper_temp": _num(c.upper_temp),
            "difficulty": c.difficulty,
            "variants": [
                {
                    "maturity_type": v.maturity_type,
                    "gdd_target": v.gdd_target,
                    "days_to_harvest": v.days_to_harvest,
                    "stages": [
                        {
                            "stage_order": s.stage_order,
                            "stage_name": s.stage_name,
                            "gdd_from": s.gdd_from,
                            "gdd_to": s.gdd_to,
                            "water_need_mm": _num(s.water_need_mm),
                            "fertilize_needed": s.fertilize_needed,
                            "guide_text": s.guide_text,
                        }
                        for s in stage_by_variant.get(v.variant_id, [])
                    ],
                }
                for v in variant_by_crop.get(c.crop_id, [])
            ],
            "disaster_rules": [
                {
                    "hazard": r.hazard,
                    "rule_kind": r.rule_kind,
                    "stage_name": r.stage_name,
                    "metric": r.metric,
                    "op": r.op,
                    "threshold_c": _num(r.threshold_c),
                    "duration_days": r.duration_days,
                    "severity": r.severity,
                }
                for r in rule_by_crop.get(c.crop_id, [])
            ],
        }
        for c in crops
    ]
