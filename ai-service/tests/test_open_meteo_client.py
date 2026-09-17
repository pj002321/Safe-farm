"""네트워크 없이 순수 함수만 검증. fixture 는 실제 응답 형태 그대로."""
from pipeline.open_meteo_client import (
    normalize_current,
    normalize_daily_forecast,
    normalize_hourly,
)

DAILY_RESPONSE = {
    "time": ["2026-09-17", "2026-09-18"],
    "temperature_2m_max": [28.8, 27.1],
    "temperature_2m_min": [18.2, 17.5],
    "precipitation_sum": [0.0, 12.4],
    "precipitation_probability_max": [10, 80],
    "wind_speed_10m_max": [9.4, 21.6],
    "relative_humidity_2m_mean": [55, 78],
}

# Open-Meteo 의 hourly 는 **오늘 00시부터** 온다. 지금이 09시면 앞 9건은 이미 지났다.
HOURLY_RESPONSE = {
    "time": [f"2026-09-17T{h:02d}:00" for h in range(24)]
    + [f"2026-09-18T{h:02d}:00" for h in range(24)],
    "temperature_2m": list(range(48)),
    "precipitation": [0.0] * 48,
    "precipitation_probability": list(range(48)),
}


def test_normalize_daily_forecast_maps_columns_by_index():
    rows = normalize_daily_forecast(DAILY_RESPONSE)
    assert rows[0] == {
        "date": "2026-09-17",
        "temp_max": 28.8,
        "temp_min": 18.2,
        "rainfall_mm": 0.0,
        "rain_chance": 10,
        "wind_max": 9.4,
        "humidity": 55,
    }
    assert rows[1]["date"] == "2026-09-18"
    assert rows[1]["wind_max"] == 21.6


def test_normalize_current_maps_fields():
    assert normalize_current(
        {
            "time": "2026-09-17T09:00",
            "temperature_2m": 21.3,
            "relative_humidity_2m": 62,
            "precipitation": 0.0,
            "wind_speed_10m": 3.4,
        }
    ) == {
        "observedAt": "2026-09-17T09:00",
        "tempC": 21.3,
        "humidityPct": 62,
        "rainfallMm": 0.0,
        "windMs": 3.4,
    }


def test_normalize_current_returns_none_when_absent():
    # 값이 없는 것과 0 은 다르다. 없으면 화면이 실황 칸 자체를 안 그려야 한다.
    assert normalize_current(None) is None
    assert normalize_current({}) is None


def test_normalize_hourly_starts_at_now_not_midnight():
    """지금이 09시면 00~08시는 이미 지난 시간이다 — 그걸 '앞으로 24시간'으로
    보여주면 화면이 거짓말을 한다."""
    rows = normalize_hourly(HOURLY_RESPONSE, "2026-09-17T09:00")
    assert len(rows) == 24
    assert rows[0]["time"] == "2026-09-17T09:00"
    assert rows[0]["tempC"] == 9
    # 24건이면 다음 날 08시까지 — 하루 앞을 본다.
    assert rows[-1]["time"] == "2026-09-18T08:00"


def test_normalize_hourly_falls_back_to_head_without_start_time():
    rows = normalize_hourly(HOURLY_RESPONSE, None)
    assert rows[0]["time"] == "2026-09-17T00:00"


def test_normalize_hourly_handles_short_tail():
    """구간 끝에서는 남은 만큼만 준다 — 인덱스를 넘겨 죽으면 예보 전체가 502 가 된다."""
    rows = normalize_hourly(HOURLY_RESPONSE, "2026-09-18T20:00")
    assert len(rows) == 4
    assert rows[-1]["time"] == "2026-09-18T23:00"


def test_normalize_hourly_empty_when_missing():
    assert normalize_hourly(None, "2026-09-17T09:00") == []
    assert normalize_hourly({}, "2026-09-17T09:00") == []
