"""`service/recommend.fetch_recent_weather` 가 실측에 평년값을 붙이는 자리.

사용자 요청(2026-09-20): "일시적인 기온이 아니라 그 지역의 역대 수치 평균과
비교해야" — explain 프롬프트가 평년값을 쓰려면 이 자리가 먼저 붙여 줘야 한다.
DB 없이, `all_stations`/`normals_of`/`fetch_forecast` 를 그 자리에서 흉내 낸다.
"""

import asyncio
from types import SimpleNamespace

import app.service.recommend as recommend
from app.repo.station import StationRow

STATION = StationRow(station_code="108", name="서울", latitude=37.5, longitude=127.0)


def _patch_common(monkeypatch, forecast_days, normals_by_source):
    monkeypatch.setattr(recommend, "all_stations", lambda db: [STATION])
    monkeypatch.setattr(
        recommend,
        "normals_of",
        lambda db, stations, source: normals_by_source.get(source, []),
    )
    monkeypatch.setattr(
        recommend,
        "fetch_forecast",
        lambda lat, lon, past, days: {"daily": forecast_days},
    )
    monkeypatch.setattr(
        recommend,
        "normalize_daily_forecast",
        lambda daily: daily,
    )
    monkeypatch.setattr(recommend, "date", SimpleNamespace(today=lambda: _FUTURE))


class _FUTURE:
    @staticmethod
    def isoformat():
        return "2999-01-01"


def test_attaches_matching_normal_by_month_day(monkeypatch):
    forecast = [{"date": "2026-04-10", "temp_max": 24.0, "temp_min": 14.0}]
    normals = {"kma": [("108", 4, 10, 20.0, 10.0)]}
    _patch_common(monkeypatch, forecast, normals)

    days = asyncio.run(recommend.fetch_recent_weather(db=object(), lat=37.5, lon=127.0))

    assert len(days) == 1
    assert days[0].tmax_normal_c == 20.0
    assert days[0].tmin_normal_c == 10.0


def test_falls_back_to_older_normal_period_when_latest_is_empty(monkeypatch):
    forecast = [{"date": "2026-04-10", "temp_max": 24.0, "temp_min": 14.0}]
    normals = {"kma": [], "kma-1981": [("108", 4, 10, 18.0, 8.0)]}
    _patch_common(monkeypatch, forecast, normals)

    days = asyncio.run(recommend.fetch_recent_weather(db=object(), lat=37.5, lon=127.0))

    assert days[0].tmax_normal_c == 18.0


def test_missing_normal_leaves_field_none_without_dropping_the_day(monkeypatch):
    forecast = [{"date": "2026-04-10", "temp_max": 24.0, "temp_min": 14.0}]
    _patch_common(monkeypatch, forecast, normals_by_source={})

    days = asyncio.run(recommend.fetch_recent_weather(db=object(), lat=37.5, lon=127.0))

    assert len(days) == 1
    assert days[0].tmax_normal_c is None
    assert days[0].tmin_normal_c is None
