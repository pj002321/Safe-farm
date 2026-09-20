"""`service/recommend.fetch_recent_weather` 가 실측에 평년값을 붙이는 자리.

사용자 요청(2026-09-20): "일시적인 기온이 아니라 그 지역의 역대 수치 평균과
비교해야" — explain 프롬프트가 평년값을 쓰려면 이 자리가 먼저 붙여 줘야 한다.
평년값 조회 자체(관측소 탐색·기간 폴백)는 `test_climate_normals.py` 가 지킨다 —
여기서는 `normals_by_day_near` 를 통째로 갈아 끼워 "날짜별로 올바르게 붙이는지"만 본다.
"""

import asyncio
from types import SimpleNamespace

import app.service.recommend as recommend


def _patch_common(monkeypatch, forecast_days, normals_by_day):
    monkeypatch.setattr(recommend, "normals_by_day_near", lambda db, lat, lon: normals_by_day)
    monkeypatch.setattr(
        recommend,
        "fetch_forecast",
        lambda lat, lon, past, days: {"daily": forecast_days},
    )
    monkeypatch.setattr(recommend, "normalize_daily_forecast", lambda daily: daily)
    monkeypatch.setattr(recommend, "date", SimpleNamespace(today=lambda: _FUTURE))


class _FUTURE:
    @staticmethod
    def isoformat():
        return "2999-01-01"


def test_attaches_matching_normal_by_month_day(monkeypatch):
    forecast = [{"date": "2026-04-10", "temp_max": 24.0, "temp_min": 14.0}]
    _patch_common(monkeypatch, forecast, {(4, 10): (20.0, 10.0)})

    days = asyncio.run(recommend.fetch_recent_weather(db=object(), lat=37.5, lon=127.0))

    assert len(days) == 1
    assert days[0].tmax_normal_c == 20.0
    assert days[0].tmin_normal_c == 10.0


def test_missing_normal_leaves_field_none_without_dropping_the_day(monkeypatch):
    forecast = [{"date": "2026-04-10", "temp_max": 24.0, "temp_min": 14.0}]
    _patch_common(monkeypatch, forecast, {})

    days = asyncio.run(recommend.fetch_recent_weather(db=object(), lat=37.5, lon=127.0))

    assert len(days) == 1
    assert days[0].tmax_normal_c is None
    assert days[0].tmin_normal_c is None
