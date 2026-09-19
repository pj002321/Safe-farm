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


#: 평년값 우선순위. normals 에는 기간이 다른 두 벌이 같이 들어 있다 —
#: `kma` 는 최신 30년(174곳), `kma-1981` 은 1981~2010(72곳)이고 70곳은 양쪽에 다 있다.
#:
#: **섞지 않는다.** 두 기간을 평균하면 어느 30년에도 해당하지 않는 값이 나온다.
#: 관측소마다 앞에서부터 찾아 있는 쪽 한 벌만 쓴다 — Next 의
#: `src/shared/growth/normalStore.ts` 와 같은 규칙이다. 두 곳이 어긋나면 같은
#: 지역에서 도달 예측과 편차 지도가 다른 기준을 쓰게 된다.
#:
#: `kma` 만 고집하면 143(대구)·146(전주)가 통째로 빠진다. 이 둘은 `kma-1981`
#: 에만 있다. 기준 연대가 달라 누적 GDD 가 평균 2% 낮게(=편차가 2%p 높게) 잡히지만,
#: 등급 경계가 ±10% 라 대개 같은 칸에 머문다 — 지도에서 회색으로 비는 것보다 낫다.
#: 제대로 된 해법은 두 곳의 `kma` 평년값을 적재하는 것이다(pipeline/load_data.py).
#:
#: `open-meteo-era5` 는 여기 없다 — 기상청 평년값과 산출 방식이 달라 섞지 않는다.
NORMAL_SOURCES = ("kma", "kma-1981")


def _fetch_normals(db: Session, stations: list[str], source: str):
    """평년 기간 하나에서 관측소 여럿의 일별 평년값을 한 번에 읽는다."""
    return db.execute(
        select(
            Normal.station, Normal.month, Normal.day, Normal.tmax_normal, Normal.tmin_normal
        ).where(
            Normal.station.in_(stations), Normal.source == source
        )
    ).all()


def _normal_gdd_by_station(
    db: Session, stations: list[str], start: date, end: date
) -> dict[str, float]:
    """normals(월/일 365개 고정행)에서 관측소별 평년 누적 GDD.

    날짜 범위만큼 (월,일)로 골라 더한다.

    `NORMAL_SOURCES` 를 순서대로 훑되, **아직 값을 못 찾은 관측소만** 다음 기간에
    다시 묻는다. 대개 첫 질의에서 전부 찾아 왕복은 한 번이고, 대구·전주가 섞여
    있을 때만 두 번째 질의가 그 두 곳으로 돈다.
    """
    by_station: dict[str, dict[tuple[int, int], tuple[float, float]]] = {}

    remaining = list(stations)
    for source in NORMAL_SOURCES:
        # 빈 목록으로 in_() 을 부르지 않는다 — 돌 이유가 없는 질의다.
        if not remaining:
            break
        for stn, month, day, tmax, tmin in _fetch_normals(db, remaining, source):
            if tmax is not None and tmin is not None:
                by_station.setdefault(stn, {})[(month, day)] = (tmax, tmin)
        remaining = [stn for stn in remaining if stn not in by_station]

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
    # 평년값은 normal_station 에서 본다. 평년값이 없는 관측소(공항·신설)는 실측만 자기 것을 쓰고
    # 평년값을 닮은 짝에서 빌린다(pipeline/region/normal_fallback.py). 칸이 없으면 자기 자신 —
    # 옛 CSV 와도 그대로 맞는다
    normal_stations = sorted(
        {row.get("normal_station") or row["station"] for row in sigungu_stations}
    )

    actual_by_stn = _actual_gdd_by_station(db, stations, start, today)
    normal_by_stn = _normal_gdd_by_station(db, normal_stations, start, today)

    out: dict[str, dict] = {}
    for row in sigungu_stations:
        stn = row["station"]
        actual = actual_by_stn.get(stn)
        normal = normal_by_stn.get(row.get("normal_station") or stn)

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
