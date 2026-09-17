"""시군구 단위 누적 GDD 와 평년 대비 편차 조회. F6(평년 대비 판정)의 지역 집계 버전(V1-37).

계산식은 app/domain/gdd.py(순수 함수), 이 파일은 DB에서 값을 모아 넘겨주기만 한다.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.gdd import classify_deviation, daily_gdd, station_plot_id
from app.models.normal import Normal
from app.models.weather import WeatherDaily


def _actual_gdd_by_station(
    db: Session, stations: list[str], start: date, end: date
) -> dict[str, float]:
    """weather_daily 에서 관측소별(합성 plot_id) 실측 누적 GDD.

    쿼리 한 번으로 전 관측소를 가져온다.
    """
    plot_ids = [station_plot_id(s) for s in stations]
    rows = db.execute(
        select(WeatherDaily.plot_id, WeatherDaily.tmax, WeatherDaily.tmin).where(
            WeatherDaily.plot_id.in_(plot_ids),
            WeatherDaily.date >= start,
            WeatherDaily.date <= end,
        )
    ).all()

    totals: dict[str, float] = {}
    for plot_id, tmax, tmin in rows:
        if tmax is None or tmin is None:
            continue
        stn = plot_id.removeprefix("stn:")
        totals[stn] = totals.get(stn, 0.0) + daily_gdd(tmax, tmin)
    return totals


def _normal_gdd_by_station(
    db: Session, stations: list[str], start: date, end: date
) -> dict[str, float]:
    """normals(월/일 365개 고정행)에서 관측소별 평년 누적 GDD.

    날짜 범위만큼 (월,일)로 골라 더한다.
    """
    rows = db.execute(
        select(
            Normal.station, Normal.month, Normal.day, Normal.tmax_normal, Normal.tmin_normal
        ).where(
            Normal.station.in_(stations), Normal.source == "kma"
        )
    ).all()

    by_station: dict[str, dict[tuple[int, int], tuple[float, float]]] = {}
    for stn, month, day, tmax, tmin in rows:
        if tmax is not None and tmin is not None:
            by_station.setdefault(stn, {})[(month, day)] = (tmax, tmin)

    totals: dict[str, float] = {}
    for stn, by_month_day in by_station.items():
        total, d = 0.0, start
        while d <= end:
            pair = by_month_day.get((d.month, d.day))
            if pair:
                total += daily_gdd(*pair)
            d += timedelta(days=1)
        totals[stn] = total
    return totals


def sigungu_gdd_deviation(
    db: Session, sigungu_stations: list[dict], today: date | None = None
) -> dict[str, dict]:
    """시군구 코드 → {station, actualGdd, normalGdd, deviationPct, color, label}.

    누적 구간은 올해 1/1 ~ today 고정이다(작물별 파종일이 아니라 지역 전체 지도라서).
    """
    today = today or date.today()
    start = date(today.year, 1, 1)
    stations = sorted({row["station"] for row in sigungu_stations})

    actual_by_stn = _actual_gdd_by_station(db, stations, start, today)
    normal_by_stn = _normal_gdd_by_station(db, stations, start, today)

    out: dict[str, dict] = {}
    for row in sigungu_stations:
        stn = row["station"]
        actual = actual_by_stn.get(stn)
        normal = normal_by_stn.get(stn)

        deviation_pct = None
        if actual is not None and normal is not None and normal > 0:
            deviation_pct = (actual - normal) / normal * 100

        color, label = classify_deviation(deviation_pct)
        out[row["sigungu_code"]] = {
            "station": stn,
            "stationName": row["station_name"],
            "actualGdd": round(actual, 1) if actual is not None else None,
            "normalGdd": round(normal, 1) if normal is not None else None,
            "deviationPct": round(deviation_pct, 1) if deviation_pct is not None else None,
            "color": color,
            "label": label,
        }
    return out
