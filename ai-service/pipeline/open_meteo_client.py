"""Open-Meteo 예보 호출 + 정규화. API 키 불필요, DB 의존 없음.

기상청 API허브(kma_client.py)는 격자 변환이 있어야 하고 바람 예보를 안 준다.
Open-Meteo 는 위경도 그대로 호출해 기온·강수·바람을 한 번에 준다 — 밭 단위
예보(/v1/weather/plot)엔 이걸 쓴다.
"""
import requests

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def fetch_daily_forecast(lat, lon, days=7):
    """일별 예보. days 는 오늘 포함 조회 일수(Open-Meteo 최대 16일)."""
    resp = requests.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean",
            "timezone": "Asia/Seoul",
            "forecast_days": days,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["daily"]


def normalize_daily_forecast(daily):
    """{"time": [...], "temperature_2m_max": [...], ...} → 날짜별 dict 리스트."""
    out = []
    for i, d in enumerate(daily["time"]):
        out.append(
            {
                "date": d,
                "temp_max": daily["temperature_2m_max"][i],
                "temp_min": daily["temperature_2m_min"][i],
                "rainfall_mm": daily["precipitation_sum"][i],
                "rain_chance": daily["precipitation_probability_max"][i],
                "wind_max": daily["wind_speed_10m_max"][i],
                "humidity": daily["relative_humidity_2m_mean"][i],
            }
        )
    return out
