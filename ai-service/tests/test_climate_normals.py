"""`service/climate_normals.normals_by_day_near` — 가장 가까운 관측소의 평년값 조회.

`recommend.py`(설명용)와 `variant.py`(숙기 추천용) 둘 다 이 하나를 쓴다.
"""

import app.service.climate_normals as climate_normals
from app.repo.station import StationRow

STATION = StationRow(station_code="108", name="서울", latitude=37.5, longitude=127.0)


def test_picks_matching_normal_by_month_day(monkeypatch):
    monkeypatch.setattr(climate_normals, "all_stations", lambda db: [STATION])
    monkeypatch.setattr(
        climate_normals,
        "normals_of",
        lambda db, stations, source: [("108", 4, 10, 20.0, 10.0)] if source == "kma" else [],
    )

    by_day = climate_normals.normals_by_day_near(db=object(), lat=37.5, lon=127.0)

    assert by_day[(4, 10)] == (20.0, 10.0)


def test_falls_back_to_older_normal_period_when_latest_is_empty(monkeypatch):
    monkeypatch.setattr(climate_normals, "all_stations", lambda db: [STATION])
    monkeypatch.setattr(
        climate_normals,
        "normals_of",
        lambda db, stations, source: [("108", 4, 10, 18.0, 8.0)] if source == "kma-1981" else [],
    )

    by_day = climate_normals.normals_by_day_near(db=object(), lat=37.5, lon=127.0)

    assert by_day[(4, 10)] == (18.0, 8.0)


def test_no_nearby_station_yields_empty(monkeypatch):
    monkeypatch.setattr(climate_normals, "all_stations", lambda db: [])

    assert climate_normals.normals_by_day_near(db=object(), lat=37.5, lon=127.0) == {}
