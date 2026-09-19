"""시군구 단위 최근 강수량·최대풍속 조회. 지도의 강수·바람 레이어가 쓴다.

판정 로직은 app/domain/weather_region.py(순수 함수), 이 파일은 DB에서 값을 모아 넘겨주기만 한다.
GDD 와 달리 평년 대비가 아니라 관측소별 가장 최근 관측일의 값 그대로다 — 강수·바람은
누적이 아니라 "지금 수준"이 중요해서다.
"""

from __future__ import annotations

import csv
from functools import lru_cache

from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.config import DATA_DIR
from app.domain.gdd import station_plot_id
from app.domain.weather_region import classify_rain, classify_wind
from app.models.weather import WeatherDaily
from pipeline.open_meteo_client import fetch_current_wind_directions

STATION_COORDS_PATH = DATA_DIR / "master" / "stations.csv"


@lru_cache(maxsize=1)
def _station_coords() -> dict[str, tuple[float, float]]:
    """관측소 번호 → (위도, 경도). 풍향을 Open-Meteo 로 낼 때 좌표가 필요하다 —
    일통계(arcltr_sfc_day) 에는 풍향 필드 자체가 없다(DOMAIN_REF.md §3-①).
    """
    with STATION_COORDS_PATH.open(encoding="utf-8") as f:
        return {
            row["station_code"]: (float(row["latitude"]), float(row["longitude"]))
            for row in csv.DictReader(f)
        }


def _wind_directions_by_station(stations: list[str]) -> dict[str, float]:
    """관측소별 지금 풍향(도). 외부 호출 실패는 화살표만 빠지게 두고 지도 전체를
    깨뜨리지 않는다 — 색상(windMax)은 이미 DB 값이라 이 호출과 무관하다.
    """
    coords_by_stn = _station_coords()
    known = [s for s in stations if s in coords_by_stn]
    if not known:
        return {}
    try:
        degrees = fetch_current_wind_directions([coords_by_stn[s] for s in known])
    except Exception:  # noqa: BLE001 — 외부 API 장애는 방향 없음으로 낮춘다
        return {}
    return {stn: deg for stn, deg in zip(known, degrees) if deg is not None}
from app.repo.weather_daily import obs_values


def _latest_value_by_station(
    db: Session, stations: list[str], column: ColumnElement
) -> dict[str, float]:
    """관측소별 가장 최근 날짜의 값 하나. 결측(None)인 행은 건너뛴다."""
    rows = obs_values(db, [station_plot_id(s) for s in stations], column)

    latest: dict[str, tuple] = {}
    for plot_id, d, value in rows:
        stn = plot_id.removeprefix("stn:")
        if stn not in latest or d > latest[stn][0]:
            latest[stn] = (d, value)
    return {stn: value for stn, (_, value) in latest.items()}


def sigungu_rain_levels(db: Session, sigungu_stations: list[dict]) -> dict[str, dict]:
    """시군구 코드 → {station, stationName, rainMm, color, label}."""
    stations = sorted({row["station"] for row in sigungu_stations})
    by_stn = _latest_value_by_station(db, stations, WeatherDaily.rain)

    out: dict[str, dict] = {}
    for row in sigungu_stations:
        value = by_stn.get(row["station"])
        color, label = classify_rain(value)
        out[row["sigungu_code"]] = {
            "station": row["station"],
            "stationName": row["station_name"],
            "rainMm": round(value, 1) if value is not None else None,
            "color": color,
            "label": label,
        }
    return out


def sigungu_wind_levels(db: Session, sigungu_stations: list[dict]) -> dict[str, dict]:
    """시군구 코드 → {station, stationName, windMax, windDeg, color, label}."""
    stations = sorted({row["station"] for row in sigungu_stations})
    by_stn = _latest_value_by_station(db, stations, WeatherDaily.wind_max)
    deg_by_stn = _wind_directions_by_station(stations)

    out: dict[str, dict] = {}
    for row in sigungu_stations:
        value = by_stn.get(row["station"])
        color, label = classify_wind(value)
        out[row["sigungu_code"]] = {
            "station": row["station"],
            "stationName": row["station_name"],
            "windMax": round(value, 1) if value is not None else None,
            "windDeg": deg_by_stn.get(row["station"]),
            "color": color,
            "label": label,
        }
    return out
