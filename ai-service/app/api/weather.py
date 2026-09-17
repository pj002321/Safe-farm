"""밭 좌표 기준 예보(V1-41). DB 없이 Open-Meteo 를 그때그때 불러 돌려준다.

격자 기준 적재 테이블(weather_forecast)은 쓸 파이프라인이 없어 만들지 않았다.
위경도로 바로 조회되는 Open-Meteo 를 실시간으로 부른다 — `/weather` 탭이 당장
필요로 하는 건 캐시된 격자값이 아니라 "지금 이 자리 예보"다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import require_service_token
from pipeline.open_meteo_client import fetch_daily_forecast, normalize_daily_forecast

router = APIRouter(prefix="/v1/weather", tags=["weather"])


@router.get("/plot", dependencies=[Depends(require_service_token)])
def plot_forecast(lat: float, lon: float) -> dict:
    """해당 좌표의 7일 일별 예보(기온·강수·최대풍속)."""
    try:
        daily = fetch_daily_forecast(lat, lon)
    except Exception as exc:  # noqa: BLE001 — 외부 API 장애를 그대로 502 로 환원
        raise HTTPException(status_code=502, detail=type(exc).__name__) from exc

    days = [
        {
            "date": row["date"],
            "tempMax": row["temp_max"],
            "tempMin": row["temp_min"],
            "rainfallMm": row["rainfall_mm"],
            "windMax": row["wind_max"],
        }
        for row in normalize_daily_forecast(daily)
    ]
    return {"days": days}
