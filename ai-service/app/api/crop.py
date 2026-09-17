"""작물 마스터 조회.

밭 등록 화면의 선택지와 리포트 화면의 생육단계가 여기서 나온다.
계산은 하지 않는다 — 기준값을 그대로 내보낸다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.schemas.crop import CropDetailOut, CropSummaryOut
from app.service.crop import crop_detail, crop_list

router = APIRouter(prefix="/v1/crops", tags=["crops"])


@router.get("", dependencies=[Depends(require_service_token)])
def list_crops(db: Session = Depends(get_db)) -> list[CropSummaryOut]:
    """등록된 작물 전부. 이름순 13작물이다.

    숙기·단계는 싣지 않는다 — 필요하면 `/v1/crops/detail` 을 쓴다.
    """
    return crop_list(db)


@router.get("/detail", dependencies=[Depends(require_service_token)])
def detail_crops(
    name: list[str] = Query(..., description="작물 이름. 여럿이면 name=배추&name=무"),
    db: Session = Depends(get_db),
) -> list[CropDetailOut]:
    """작물의 숙기·생육단계·재해규칙까지.

    ⚠ 이름을 **여럿** 받는다. 한 밭에 작물이 여럿이라(plots.crops 가 배열)
      하나씩 부르면 왕복이 작물 수만큼 늘어난다.

    ⚠ 없는 이름은 조용히 빠진다. 404 를 내지 않는다 — 밭에 등록된 작물 중
      하나가 마스터에서 빠졌다고 화면 전체가 죽으면 안 된다.
    """
    return crop_detail(db, name)
