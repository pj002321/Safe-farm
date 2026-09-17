"""Open-Meteo 예보 호출 + 정규화. API 키 불필요, DB 의존 없음.

기상청 API허브(kma_client.py)는 격자 변환이 있어야 하고 바람 예보를 안 준다.
Open-Meteo 는 위경도 그대로 호출해 기온·강수·바람을 한 번에 준다 — 밭 단위
예보(/v1/weather/plot)엔 이걸 쓴다.

**현재 실황·시간별·일별을 한 번의 요청으로 받는다.** Open-Meteo 는 `current`,
`hourly`, `daily` 를 같은 호출에 함께 받을 수 있다. 셋을 따로 부르면 왕복이 셋이
되고 밭 수만큼 곱해진다 — 밭이 셋이면 3회가 9회가 된다.
"""
import requests

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# 시간별로 보여 줄 구간. 하루 앞을 보는 것이 목적이라 24로 둔다.
HOURLY_SPAN = 24


def fetch_forecast(lat, lon, days=7):
    """현재 실황 + 시간별 + 일별 예보를 한 번에. days 는 오늘 포함 조회 일수(최대 16).

    시간별은 `forecast_days` 만큼 통째로 오고, 그중 지금 이후 구간만 쓴다
    (`normalize_hourly`). Open-Meteo 는 hourly 를 **오늘 00시부터** 주기 때문에
    그냥 앞에서 자르면 이미 지난 시간을 보여주게 된다.
    """
    resp = requests.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
            "hourly": "temperature_2m,precipitation,precipitation_probability",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean",
            "timezone": "Asia/Seoul",
            "forecast_days": days,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_daily_forecast(lat, lon, days=7):
    """일별만 필요한 호출자를 위한 얇은 래퍼. 요청은 위와 같은 한 번이다."""
    return fetch_forecast(lat, lon, days)["daily"]


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


def normalize_current(current):
    """현재 실황 한 건. 키가 없으면 None 으로 둔다 — 값이 없는 것과 0 은 다르다."""
    if not current:
        return None
    return {
        "observedAt": current.get("time"),
        "tempC": current.get("temperature_2m"),
        "humidityPct": current.get("relative_humidity_2m"),
        "rainfallMm": current.get("precipitation"),
        "windMs": current.get("wind_speed_10m"),
    }


def normalize_hourly(hourly, start_time, span=HOURLY_SPAN):
    """`start_time`(현재 실황 시각) **이후** 시간별 예보 span 건.

    Open-Meteo 의 hourly 는 오늘 00시부터 시작한다. 앞에서 그냥 자르면 이미 지난
    시간을 보여주게 되므로, 시작 지점을 시각으로 찾는다. 문자열 비교로 충분하다 —
    같은 타임존의 ISO 문자열은 사전순이 곧 시간순이다.

    시각을 못 찾으면(응답 형태가 다르거나 start_time 이 없으면) 앞에서부터 준다.
    비어 있는 것보다 낫고, 화면이 시각을 그대로 찍으므로 오해할 여지가 없다.
    """
    if not hourly or not hourly.get("time"):
        return []

    times = hourly["time"]
    start = 0
    if start_time:
        # 실황 시각의 '시' 단위까지만 맞춘다(분은 응답마다 다르다).
        hour_key = start_time[:13]
        for i, t in enumerate(times):
            if t[:13] >= hour_key:
                start = i
                break

    out = []
    for i in range(start, min(start + span, len(times))):
        out.append(
            {
                "time": times[i],
                "tempC": hourly["temperature_2m"][i],
                "rainfallMm": hourly["precipitation"][i],
                "rainChance": hourly["precipitation_probability"][i],
            }
        )
    return out
