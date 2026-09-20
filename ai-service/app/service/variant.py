"""숙기 추천의 실 구현. `variant_fit.pick_maturity` 는 순수 함수라 DB를 모른다 —
크롭·숙기를 모아 넘기고 결과를 crop_id 로 묶는 건 여기가 한다.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.domain.variant_fit import VariantCandidate, pick_maturity
from app.repo.crop import all_crops, variants_of
from app.service.climate_normals import normals_by_day_near


def recommend_maturities(
    db: Session, lat: float, lon: float, crops: list[tuple[int, date]]
) -> dict[int, str]:
    """`crops`(crop_id, 파종일) 목록 중 판단 가능한 것만 {crop_id: maturity_type} 로 낸다.

    기준온도가 없거나 숙기가 1개뿐이거나 목표 GDD가 안 채워진 작물은 결과에서
    빠진다 — 부르는 쪽(`registerPlot`)이 이미 가진 기본값(중생 우선)에 맡긴다.
    """
    crop_ids = [c for c, _ in crops]
    crops_by_id = {c.crop_id: c for c in all_crops(db) if c.crop_id in crop_ids}
    variants = variants_of(db, list(crops_by_id.keys()))

    candidates_by_crop: dict[int, list[VariantCandidate]] = {}
    for v in variants:
        if v.gdd_target is None or v.days_to_harvest is None:
            continue
        candidates_by_crop.setdefault(v.crop_id, []).append(
            VariantCandidate(v.variant_id, v.maturity_type, v.gdd_target, v.days_to_harvest)
        )

    normals = normals_by_day_near(db, lat, lon)

    result: dict[int, str] = {}
    for crop_id, sow_date in crops:
        crop = crops_by_id.get(crop_id)
        if crop is None or crop.base_temp is None:
            continue
        picked = pick_maturity(
            candidates_by_crop.get(crop_id, []),
            base_temp_c=float(crop.base_temp),
            upper_temp_c=float(crop.upper_temp) if crop.upper_temp is not None else None,
            sow_date=sow_date,
            normals_by_day=normals,
        )
        if picked:
            result[crop_id] = picked.maturity_type
    return result
