"""밭 좌표 기준 예보(V1-41). 미래 예보는 DB 없이 Open-Meteo 를 그때그때 불러 돌려준다.

격자 기준 적재 테이블(weather_forecast)은 쓸 파이프라인이 없어 만들지 않았다.
위경도로 바로 조회되는 Open-Meteo 를 실시간으로 부른다 — `/weather` 탭이 당장
필요로 하는 건 캐시된 격자값이 아니라 "지금 이 자리 예보"다.

최근 누적 강수량(V1-67)만 예외로 DB(`weather_obs_daily`)를 본다 — 그건 이미
지난 실측이라 Open-Meteo 의 미래 예보로는 낼 수 없다.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.models.farm import Plot
from app.service.plot_growth import (
    crop_interpretation,
    daily_gdd_series,
    nearest_station,
    rainfall_totals,
)
from pipeline.open_meteo_client import fetch_daily_forecast, normalize_daily_forecast

router = APIRouter(prefix="/v1/weather", tags=["weather"])


@router.get("/plot", dependencies=[Depends(require_service_token)])
def plot_forecast(
    lat: float, lon: float, plot_id: UUID | None = None, db: Session = Depends(get_db)
) -> dict:
    """해당 좌표의 7일 일별 예보(기온·강수·최대풍속) + 최근접 관측소 기준 누적 강수량
    + (plot_id 가 있으면) 최근 14일 하루치 GDD(V1-69, 생육 속도 원인 시각화)."""
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
            "rainChance": row["rain_chance"],
            "windMax": row["wind_max"],
            "humidityPct": row["humidity"],
        }
        for row in normalize_daily_forecast(daily)
    ]

    # 관측소가 하나도 없으면(초기 DB) 누적 강수량은 전부 None — 판정 보류.
    station = nearest_station(db, SimpleNamespace(latitude=lat, longitude=lon))
    rainfall = rainfall_totals(db, station.station_code) if station else {3: None, 5: None, 7: None}

    growth_series = None
    crop_impact = None
    if plot_id is not None and station is not None:
        plot = db.get(Plot, plot_id)
        if plot:
            growth_series = daily_gdd_series(db, plot, station)
            impact = crop_interpretation(db, plot, station)
            if impact:
                crop_impact = {
                    "cropNameKo": impact["crop_name_ko"],
                    "baseTempC": impact["base_temp_c"],
                    "upperTempC": impact["upper_temp_c"],
                    "stageName": impact["stage_name"],
                    "waterNeedMm": impact["water_need_mm"],
                }

    return {
        "days": days,
        "rainfall3d": rainfall[3],
        "rainfall5d": rainfall[5],
        "rainfall7d": rainfall[7],
        "growthSeries": growth_series,
        "cropImpact": crop_impact,
    }
