"""KMA 정규화 데이터를 Postgres 에 적재. pipeline/kma_client.py 의 순수 함수 결과를 받아 쓴다."""
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.alert import OfficialAlert
from app.models.disaster_rule import DisasterRule
from app.models.normal import Normal
from app.models.weather import WeatherDaily
from pipeline.kma_client import (
    fetch_daily_lst_min,
    fetch_normals,
    fetch_solar_term_crop,
    fetch_warnings,
    fetch_weather_daily,
    normalize_alerts,
    normalize_disaster_rule,
    normalize_normals,
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


def load_normals(db, api_key, stn):
    """관측소 연중 평년값(365일치, 1991~2020)을 normals 에 upsert."""
    rows = normalize_normals(fetch_normals(api_key, stn))

    for row in rows:
        stmt = pg_insert(Normal).values(**row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["station", "month", "day", "source"],
            set_={
                "tmax_normal": stmt.excluded.tmax_normal,
                "tmin_normal": stmt.excluded.tmin_normal,
                "rain_normal": stmt.excluded.rain_normal,
            },
        )
        db.execute(stmt)

    db.commit()
    return len(rows)


def load_disaster_rule(db, api_key, stn, risk, solar_term, yy1, yy2, crop_id=""):
    """절기재해 기준값(다년 평균) 한 행을 disaster_rules 에 upsert."""
    row = normalize_disaster_rule(
        fetch_solar_term_crop(api_key, stn, risk, solar_term, yy1, yy2), stn, risk, solar_term, crop_id
    )

    stmt = pg_insert(DisasterRule).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["station", "risk", "solar_term", "crop_id"],
        set_={
            "ta_min": stmt.excluded.ta_min,
            "tg_min": stmt.excluded.tg_min,
            "sample_years": stmt.excluded.sample_years,
        },
    )
    db.execute(stmt)
    db.commit()
    return 1
