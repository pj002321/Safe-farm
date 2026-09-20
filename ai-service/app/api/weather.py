"""밭 좌표 기준 예보(V1-41). 미래 예보는 DB 없이 Open-Meteo 를 그때그때 불러 돌려준다.

격자 기준 적재 테이블(weather_forecast)은 쓸 파이프라인이 없어 만들지 않았다.
위경도로 바로 조회되는 Open-Meteo 를 실시간으로 부른다 — `/weather` 탭이 당장
필요로 하는 건 캐시된 격자값이 아니라 "지금 이 자리 예보"다.

DB 를 보는 것은 **지난 실측과 우리 데이터**뿐이다:
  · 최근 누적 강수량(V1-67)   — 이미 지난 관측이라 미래 예보로는 낼 수 없다.
  · 하루치 GDD·작물 해석      — 이 밭에 무엇이 심겼는지는 우리만 안다.
  · 기상특보                  — 기상청 스냅샷을 배치가 적재해 둔 것이다.

**호출은 한 번이다.** 현재 실황·시간별·일별을 Open-Meteo 한 요청으로 함께 받는다.
화면이 밭마다 이 엔드포인트를 부르므로 여기서 왕복을 늘리면 밭 수만큼 곱해진다.

⚠ **그 "밭마다" 를 Next 가 막아 주지 않는다.** Next 의 Data Cache 는 URL 전체로
  잡는데 이 엔드포인트의 URL 에 `plot_id`·`user_id` 가 들어간다 — 좌표가 같아도
  밭마다 따로 캐시되어 밭 수만큼 뒤로 넘어온다. 그래서 여기서도
  `forecast_cache` 를 격자 열쇠로 탄다(`grid_cache_key` 의 ⚠).
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
from app.service.forecast_cache import forecast as cached_forecast
from app.service.forecast_cache import grid_cache_key
from app.service.plot_growth import (
    crop_interpretation,
    daily_gdd_series,
    nearest_station,
    rainfall_totals,
)
from app.service.warn_region import plot_warning
from pipeline.open_meteo_client import (
    daily_index_of,
    normalize_current,
    normalize_daily_forecast,
    normalize_hourly,
)

router = APIRouter(prefix="/v1/weather", tags=["weather"])

# 영농일지가 과거 날짜로도 쓰인다. Open-Meteo 가 한 응답에 얹어 주는 최대치이고,
# 이보다 오래된 날짜는 **빈 채로 둔다**(0 으로 채우면 비가 안 왔다는 뜻이 된다).
DIARY_PAST_DAYS = 92


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
    # ⚠ **밭을 예보보다 먼저 찾는다.** 예보 열쇠에 격자가 필요해서다. 순서를 되돌려
    #   좌표로 묶으면 한 격자 안의 밭들이 각각 밖으로 나간다 — Next 의 Data Cache 는
    #   URL 전체(plot_id 포함)로 잡으므로 밭별 캐시라 저쪽이 막아 주지 않는다.
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
        payload = cached_forecast(
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
            # 아침에 밭에 나갈 때 보는 값. "2026-09-19T06:19" 꼴을 그대로 넘긴다
            "sunrise": row["sunrise"],
            "sunset": row["sunset"],
            # 그날 대표 풍향(도). **불어오는 쪽**이다 — 화살표는 화면이 돌린다
            "windDirDeg": row["wind_dir_deg"],
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


@router.get("/day", dependencies=[Depends(require_service_token)])
def weather_of_day(lat: float, lon: float, date: str) -> dict:
    """그 좌표 그 날짜 하루치. **영농일지가 저장할 때 한 번 부른다.**

    `/plot` 과 나누는 까닭 — 저쪽은 `past_days` 인자가 없어 **과거가 아예 안 온다.**
    기본값을 올려 해결하면 안 된다. `open_meteo_client.fetch_forecast` 가
    *"기본값 0 을 지킨다 — 화면 예보가 이 함수를 그대로 쓴다. 기본을 올리면
    사용자가 밭을 열 때마다 응답이 3배로 커지고 그만큼 느려진다"* 고 못 박아 뒀다.
    과거가 필요한 쪽만 인자로 올려 쓰는 것이 그 파일의 규칙이다.

    ⚠️ **자리로 날짜를 세지 않는다.** `past_days` 를 주면 배열 맨 앞이 오늘이 아니라
      92일 전이다. `daily_index_of` 로 찾는다 — 자리로 세면 9월 19일 일지에 6월
      20일 날씨가 박히고 **아무 오류도 안 난다.**

    ⚠️ **못 찾는 것은 오류가 아니다.** 92일보다 오래된 날짜는 정상적으로 없다.
      404 를 내면 호출부가 실패로 다루게 되는데, 영농일지는 그때 **빈 채로 저장**
      하고 기록 자체는 살려야 한다. 그래서 `{"day": None}` 을 200 으로 돌려준다.

    1시간 캐시(`forecast_cache`)를 타므로 같은 밭을 연달아 적으면 호출이 0회다.
    """
    try:
        payload = cached_forecast(lat, lon, past_days=DIARY_PAST_DAYS)
    except Exception as exc:  # noqa: BLE001 — 외부 API 장애를 그대로 502 로 환원
        raise HTTPException(status_code=502, detail=f"open-meteo 조회 실패: {exc}") from exc

    index = daily_index_of(payload.get("daily"), date)
    if index is None:
        logging.info("[weather] 일지 날씨 없음 date=%s (92일 밖이거나 응답에 없음)", date)
        return {"day": None}

    row = normalize_daily_forecast(payload["daily"])[index]
    return {
        "day": {
            "date": row["date"],
            "tempMax": row["temp_max"],
            "tempMin": row["temp_min"],
            "rainfallMm": row["rainfall_mm"],
            "humidityPct": row["humidity"],
            "windMax": row["wind_max"],
            # 그날 대표 풍향(도). **불어오는 쪽**이다 — 화살표는 화면이 돌린다.
            "windDirDeg": row["wind_dir_deg"],
            # "2026-09-19T06:19" 꼴 그대로. 시각만 뽑는 것은 화면의 일이다.
            "sunrise": row["sunrise"],
            "sunset": row["sunset"],
        }
    }
