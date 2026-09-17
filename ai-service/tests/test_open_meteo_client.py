"""네트워크 없이 순수 함수만 검증. fixture 는 실제 응답 형태 그대로."""
from pipeline.open_meteo_client import normalize_daily_forecast

DAILY_RESPONSE = {
    "time": ["2026-09-17", "2026-09-18"],
    "temperature_2m_max": [28.8, 27.1],
    "temperature_2m_min": [18.2, 17.5],
    "precipitation_sum": [0.0, 12.4],
    "wind_speed_10m_max": [9.4, 21.6],
}


def test_normalize_daily_forecast_maps_columns_by_index():
    rows = normalize_daily_forecast(DAILY_RESPONSE)
    assert rows[0] == {
        "date": "2026-09-17",
        "temp_max": 28.8,
        "temp_min": 18.2,
        "rainfall_mm": 0.0,
        "wind_max": 9.4,
    }
    assert rows[1]["date"] == "2026-09-18"
    assert rows[1]["wind_max"] == 21.6
