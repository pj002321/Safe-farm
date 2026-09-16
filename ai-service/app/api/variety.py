"""품종 카탈로그 조회.

밭 등록 화면의 품종 선택지와 품종 상세가 여기서 나온다. 계산은 하지 않는다 —
기준값을 그대로 내보낸다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.schemas.variety import VarietyDetailOut, VarietySummaryOut
from app.service.variety import variety_detail, variety_list

router = APIRouter(prefix="/v1/varieties", tags=["varieties"])


@router.get("", dependencies=[Depends(require_service_token)])
def list_varieties(
    crop: str | None = Query(None, description="작물 이름으로 거른다. 없으면 전체"),
    db: Session = Depends(get_db),
) -> list[VarietySummaryOut]:
    """품종 목록. summary·body 는 싣지 않는다 — 필요하면 `/v1/varieties/{no}` 를 쓴다."""
    return variety_list(db, crop)


@router.get("/{variety_no}", dependencies=[Depends(require_service_token)])
def detail_variety(variety_no: str, db: Session = Depends(get_db)) -> VarietyDetailOut:
    """품종 하나의 전체 정보. 없으면 404."""
    detail = variety_detail(db, variety_no)
    if detail is None:
        raise HTTPException(status_code=404, detail="품종을 찾을 수 없습니다")
    return detail
