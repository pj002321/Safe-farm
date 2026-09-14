"""KMA 정규화 데이터를 Postgres 에 적재. pipeline/kma_client.py 의 순수 함수 결과를 받아 쓴다."""
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.alert import OfficialAlert
from app.models.weather import WeatherDaily
from pipeline.kma_client import (
    fetch_daily_lst_min,
    fetch_warnings,
    fetch_weather_daily,
    normalize_alerts,
    normalize_weather_daily,
)


def load_weather_daily(db, plot_id, api_key, stn, lat, lon, tm1, tm2, with_lst=True):
    """일통계(필수) + 천리안 LST(2차, 서리 판정용)를 합쳐 weather_daily 에 upsert."""
    rows = normalize_weather_daily(fetch_weather_daily(api_key, stn, tm1, tm2))

    for row in rows:
        row["lst_min"] = fetch_daily_lst_min(api_key, lat, lon, row["date"]) if with_lst else None

        stmt = pg_insert(WeatherDaily).values(plot_id=plot_id, source="kma", kind="obs", **row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["plot_id", "date", "source"],
            set_={
                "tmax": stmt.excluded.tmax,
                "tmin": stmt.excluded.tmin,
                "tmean": stmt.excluded.tmean,
                "rain": stmt.excluded.rain,
                "wind_max": stmt.excluded.wind_max,
                "lst_min": stmt.excluded.lst_min,
            },
        )
        db.execute(stmt)

    db.commit()
    return len(rows)


def load_alerts(db, api_key):
    """특보현황 스냅샷을 그대로 append. 필터링(my_regions)은 조회 시점 책임 — DOMAIN_REF §4-5."""
    rows = normalize_alerts(fetch_warnings(api_key))
    db.add_all(OfficialAlert(**row) for row in rows)
    db.commit()
    return len(rows)
