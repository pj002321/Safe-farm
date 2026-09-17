"""밭 좌표 기준 예보(V1-41). 미래 예보는 DB 없이 Open-Meteo 를 그때그때 불러 돌려준다.

격자 기준 적재 테이블(weather_forecast)은 쓸 파이프라인이 없어 만들지 않았다.
위경도로 바로 조회되는 Open-Meteo 를 실시간으로 부른다 — `/weather` 탭이 당장
필요로 하는 건 캐시된 격자값이 아니라 "지금 이 자리 예보"다.

DB 를 보는 것은 **지난 실측과 우리 데이터**뿐이다:
  · 최근 누적 강수량(V1-67)   — 이미 지난 관측이라 미래 예보로는 낼 수 없다.
  · 하루치 GDD·작물 해석      — 이 밭에 무엇이 심겼는지는 우리만 안다.
  · 기상특보                  — 기상청 스냅샷을 배치가 적재해 둔 것이다.

**호출은 한 번이다.** 현재 실황·시간별·일별을 Open-Meteo 한 요청으로 함께 받는다
(`fetch_forecast`). 화면이 밭마다 이 엔드포인트를 부르므로 여기서 왕복을 늘리면
밭 수만큼 곱해진다.
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
from app.service.warn_region import plot_warning
from pipeline.open_meteo_client import (
    fetch_forecast,
    normalize_current,
    normalize_daily_forecast,
    normalize_hourly,
)

router = APIRouter(prefix="/v1/weather", tags=["weather"])


@router.get("/plot", dependencies=[Depends(require_service_token)])
def plot_forecast(
    lat: float, lon: float, plot_id: UUID | None = None, db: Session = Depends(get_db)
) -> dict:
    """해당 좌표의 현재 실황 + 시간별 24시간 + 7일 일별 예보 + 최근접 관측소 기준
    누적 강수량, 그리고 `plot_id` 가 있으면 그 밭의 하루치 GDD·작물 해석·기상특보."""
    try:
        payload = fetch_forecast(lat, lon)
    except Exception as exc:  # noqa: BLE001 — 외부 API 장애를 그대로 502 로 환원
        raise HTTPException(status_code=502, detail=f"open-meteo 조회 실패: {exc}") from exc

    current = normalize_current(payload.get("current"))
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
        for row in normalize_daily_forecast(payload["daily"])
    ]
    hours = normalize_hourly(payload.get("hourly"), current["observedAt"] if current else None)

    # 관측소가 하나도 없으면(초기 DB) 누적 강수량은 전부 None — 판정 보류.
    station = nearest_station(db, SimpleNamespace(latitude=lat, longitude=lon))
    rainfall = rainfall_totals(db, station.station_code) if station else {3: None, 5: None, 7: None}

    growth_series = None
    crop_impact = None
    alert = None
    if plot_id is not None:
        plot = db.get(Plot, plot_id)
        if plot:
            # 특보는 관측소가 없어도 낼 수 있다 — 좌표만 있으면 된다.
            # ⚠️ plot.region_code 를 넘기지 말 것. 법정동 코드라 특보 표의 통계청
            #    코드와 체계가 다르다(warn_region.plot_warning 주석 참고).
            status, as_of = plot_warning(db, lat, lon)
            if status and status.get("warnings"):
                alert = {
                    "warnings": status["warnings"],
                    "label": status.get("label"),
                    "asOf": as_of.isoformat() if as_of else None,
                }
            if station is not None:
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
        "current": current,
        "hours": hours,
        "days": days,
        "rainfall3d": rainfall[3],
        "rainfall5d": rainfall[5],
        "rainfall7d": rainfall[7],
        "growthSeries": growth_series,
        "cropImpact": crop_impact,
        "alert": alert,
    }
