"""시군구 단위 최근 강수량·최대풍속 조회. 지도의 강수·바람 레이어가 쓴다.

판정 로직은 app/domain/weather_region.py(순수 함수), 이 파일은 DB에서 값을 모아 넘겨주기만 한다.
GDD 와 달리 평년 대비가 아니라 관측소별 가장 최근 관측일의 값 그대로다 — 강수·바람은
누적이 아니라 "지금 수준"이 중요해서다.
"""

from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.domain.gdd import station_plot_id
from app.domain.weather_region import classify_rain, classify_wind
from app.models.weather import WeatherDaily
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
    """시군구 코드 → {station, stationName, windMax, color, label}."""
    stations = sorted({row["station"] for row in sigungu_stations})
    by_stn = _latest_value_by_station(db, stations, WeatherDaily.wind_max)

    out: dict[str, dict] = {}
    for row in sigungu_stations:
        value = by_stn.get(row["station"])
        color, label = classify_wind(value)
        out[row["sigungu_code"]] = {
            "station": row["station"],
            "stationName": row["station_name"],
            "windMax": round(value, 1) if value is not None else None,
            "color": color,
            "label": label,
        }
    return out
