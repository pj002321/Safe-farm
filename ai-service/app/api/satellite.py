"""좌표 기준 NDVI·NDMI 시계열(F5). DB 의존 없음 — Sentinel Hub Statistical API 를
그때그때 불러 돌려준다(weather.py 의 Open-Meteo 와 같은 이유: 배치 적재 파이프라인이
아직 없다).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import SH_CLIENT_ID, SH_CLIENT_SECRET
from app.core.db import get_db
from app.core.security import require_service_token
from app.service import satellite_cache

router = APIRouter(prefix="/v1/satellite", tags=["satellite"])


@router.get("/observations", dependencies=[Depends(require_service_token)])
def observations(
    lat: float, lon: float, date_from: str, date_to: str, db: Session = Depends(get_db)
) -> dict:
    """해당 좌표(15m 반폭 폴리곤)의 `date_from`~`date_to` NDVI·NDMI 일별 평균.

    ★ 2026-09-19 — Sentinel Hub 를 그때그때 부르던 것을 `satellite_cache` 로 바꿨다.
      **밖에서 보이는 계약은 그대로다** — 표에 있으면 표에서, 없거나 낡았을 때만
      밖에 묻는다. 이 값은 평균 18일에 한 번밖에 안 바뀐다(sentinelhub_client 머리).
    """
    if not SH_CLIENT_ID or not SH_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="SH_CLIENT_ID/SH_CLIENT_SECRET 이 설정되지 않았습니다.",
        )
    try:
        points = satellite_cache.observations(db, lat, lon, date_from, date_to)
    except Exception as exc:  # noqa: BLE001 — 외부 API 장애를 그대로 502 로 환원
        raise HTTPException(
            status_code=502, detail=f"sentinel hub 조회 실패: {exc}"
        ) from exc

    return {"points": points}
