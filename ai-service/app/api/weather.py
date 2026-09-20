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

import logging
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.repo.plot import owned_plot
from app.service.plot_growth import (
    crop_interpretation,
    daily_gdd_series,
    nearest_station,
    rainfall_totals,
)
from app.service.warn_region import plot_warning
from pipeline.open_meteo_client import (
    fetch_forecast,
    grid_cache_key,
    normalize_current,
    normalize_daily_forecast,
    normalize_hourly,
)

router = APIRouter(prefix="/v1/weather", tags=["weather"])


@router.get("/plot", dependencies=[Depends(require_service_token)])
def plot_forecast(
    lat: float,
    lon: float,
    plot_id: UUID | None = None,
    user_id: UUID | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """해당 좌표의 현재 실황 + 시간별 24시간 + 7일 일별 예보 + 최근접 관측소 기준
    누적 강수량, 그리고 `plot_id`·`user_id` 가 둘 다 있으면 그 밭의 하루치
    GDD·작물 해석·기상특보.

    **밭에 딸린 값은 `user_id` 없이 내주지 않는다.** 좌표는 지도에서 찍어도 나오는
    공개값이지만 작물·생육단계·특보는 그 밭 주인의 것이다. `require_service_token`
    은 "Next 서버가 보냈는가" 만 보므로 plot_id 가 누구 것인지는 여기서 가린다
    (`repo/plot.owned_plot` 독스트링과 같은 이유).

    `user_id` 없이 `plot_id` 만 오면 **거절하지 않고 좌표 부분만 돌려준다.**
    Next 가 아직 안 보내는 동안 예보 카드까지 통째로 죽는 것보다, 밭 값만 비고
    경고 로그가 남는 쪽이 낫다. 호출부가 다 고쳐지면 `user_id` 를 필수로 올린다.
    """
    # ⚠️ **밭을 먼저 찾는다.** 예보 캐시를 좌표가 아니라 기상청 격자로 묶는데, 격자는
    #    밭에만 있다(`plots.grid_x/grid_y`). 예보를 먼저 받으면 밭을 모르는 시점이라
    #    좌표 키로 떨어지고, 그러면 **같은 격자의 밭 넷이 넷 다 외부를 친다** —
    #    실제로 그 상태였다(격자 52,67 의 밭 4개가 전부 1.4초). 화면은 밭마다 이
    #    엔드포인트를 부르므로 여기가 캐시가 제일 많이 듣는 자리다.
    plot = None
    if plot_id is not None:
        if user_id is None:
            # 남의 밭인지 가릴 방법이 없으니 밭 값은 안 낸다. 조용히 비우면 화면이
            # "작물 정보 없음" 으로 보여 원인을 못 찾으므로 로그로 남긴다.
            logging.warning("[weather] user_id 없이 plot_id 가 왔다 — 밭 값은 생략한다")
        else:
            # 남의 밭·지운 밭은 둘 다 None 이다(owned_plot). 구분해 알리지 않는다 —
            # 구분하는 순간 "그 id 의 밭이 있다" 가 샌다.
            plot = owned_plot(db, plot_id, user_id)

    try:
        # 밭이 없으면(지도에서 좌표만 찍은 경우) 예전처럼 좌표로 묶는다.
        payload = fetch_forecast(
            lat,
            lon,
            cache_key=grid_cache_key(plot.grid_x, plot.grid_y) if plot else None,
        )
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
