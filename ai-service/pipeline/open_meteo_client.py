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


def fetch_forecast(lat, lon, days=7, past_days=0):
    """현재 실황 + 시간별 + 일별 예보를 한 번에. days 는 오늘 포함 조회 일수(최대 16).

    시간별은 `forecast_days` 만큼 통째로 오고, 그중 지금 이후 구간만 쓴다
    (`normalize_hourly`). Open-Meteo 는 hourly 를 **오늘 00시부터** 주기 때문에
    그냥 앞에서 자르면 이미 지난 시간을 보여주게 된다.

    `past_days` 는 **오늘 앞에 며칠을 더 받을지**다(최대 92). 물 수지를 내려면 지난
    강수·증발산이 있어야 하는데, 한 번의 호출로 과거와 예보가 같이 온다 — 따로 부르면
    왕복이 둘이 되고 밭 수만큼 곱해진다.

    ⚠️ **기본값 0 을 지킨다.** 화면 예보(`/v1/weather/plot`)가 이 함수를 그대로 쓴다.
      기본을 올리면 사용자가 밭을 열 때마다 **응답이 3배로 커지고 그만큼 느려진다.**
      과거가 필요한 쪽(하루 1회 배치)만 인자로 올려서 쓴다.

    ⚠️ **`past_days` 를 주면 배열 맨 앞이 오늘이 아니다.** `daily["time"]` 이 과거부터
      시작하므로 자리로 "내일" 을 세던 코드는 조용히 지난날을 가리킨다. 날짜로 찾는
      `daily_index_of` 를 쓸 것 — `normalize_hourly` 가 시각으로 시작점을 찾는 것과 같다.
    """
    resp = requests.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            # ⚠ 풍향은 **불어오는 쪽**이다(북풍 = 북쪽에서 온다). 화살표를 그릴 때
            #    가는 쪽으로 돌리려면 180도를 더해야 한다 — 화면 쪽에서 한다.
            "current": "temperature_2m,relative_humidity_2m,precipitation"
            ",wind_speed_10m,wind_direction_10m",
            # ⚠️ 토양수분은 **뿌리대(9~27cm) 하나만** 받는다. 표층(0~1cm)은 소나기 한 번에
            #    튀어 판정에 못 쓰고, 3~9cm 도 지금 쓰는 곳이 없다.
            #    셋을 다 받으면 **화면 예보 payload 가 6.5KB → 9.6KB(+48%)** 로 커진다.
            #    하나만 받으면 +1.0KB(16%) 다 (2026-09-19 실측, 대전 좌표 3회 최소값).
            #    hourly 는 past_days 와 곱해져 늘어난다 — 사용자가 밭을 열 때마다 나가는 값이다.
            "hourly": "temperature_2m,precipitation,precipitation_probability"
            ",soil_moisture_9_to_27cm",
            # et0_fao_evapotranspiration 은 **잔디 기준** 증발산(mm/일)이다. 작물계수(Kc)가
            # 없으니 "몇 mm 주세요" 를 만들지 않는다 — 마르는 쪽으로 기울었나만 본다(강수 − ET0).
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum"
            ",precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean"
            ",et0_fao_evapotranspiration"
            # 해 뜸·해 짐은 "2026-09-19T06:19" 꼴이다. 아침에 밭에 나갈 때 보는 값이라
            # 날씨 탭에 같이 싣는다. 일별 대표 풍향도 함께 — 왕복이 안 는다
            ",sunrise,sunset,wind_direction_10m_dominant",
            # ⚠️ **반드시 지정한다.** Open-Meteo 의 풍속 기본 단위는 km/h 다.
            #    빼먹으면 5.6 이 나오는데 실제로는 1.56 m/s 라, m/s 임계와 비교하는
            #    쪽(작업 가능 판정·방제 기준)이 **전부 "바람 셈"으로 판정된다.**
            #    실제로 그 버그를 냈다 — 7일 중 6일이 강풍으로 뜨고, 그 판정이
            #    비 안내보다 먼저라 진짜 비 오는 날의 안내가 묻혔다.
            #    docs/DOMAIN_REF.md:674 가 이미 경고해 둔 것이다.
            "wind_speed_unit": "ms",
            "timezone": "Asia/Seoul",
            "forecast_days": days,
            "past_days": past_days,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_daily_forecast(lat, lon, days=7, past_days=0):
    """일별만 필요한 호출자를 위한 얇은 래퍼. 요청은 위와 같은 한 번이다."""
    return fetch_forecast(lat, lon, days, past_days)["daily"]


def _at(seq, i):
    """리스트의 i 번째. 없거나 짧으면 None — **없는 것과 0 을 가르려는 것이다.**"""
    if not seq or i >= len(seq):
        return None
    return seq[i]


def daily_index_of(daily, day):
    """`daily["time"]` 에서 그 날짜가 몇 번째인가. 없으면 None.

    ⚠️ **자리로 세지 말 것.** `past_days=0` 일 때만 0 번이 오늘이다. 과거를 같이 받으면
      맨 앞이 14일 전이라, `forecast[1]` 을 "내일" 로 쓰던 코드가 **오류 없이** 지난날을
      가리킨다. 서리 경고가 지난주 날씨로 나가는 꼴이다.

    ⚠️ `day` 는 **한국 날짜**여야 한다. 요청에 `timezone=Asia/Seoul` 을 주므로 응답 날짜도
      KST 다. 서버가 UTC 면 `date.today()` 가 한국 자정 근처에 하루 어긋난다 —
      호출자가 KST 로 만들어 넘긴다.
    """
    times = (daily or {}).get("time") or []
    try:
        return times.index(day)
    except ValueError:
        return None


def normalize_daily_forecast(daily):
    """{"time": [...], "temperature_2m_max": [...], ...} → 날짜별 dict 리스트.

    ⚠️ **받은 차례 그대로 편다. 오늘이 몇 번째인지는 모른다.** `past_days` 를 준 호출이면
      앞쪽이 과거다 — 어느 날인지는 `date` 칸을 보거나 `daily_index_of` 로 찾는다.
    ⚠️ `et0_mm` 은 요청에 `et0_fao_evapotranspiration` 을 넣었을 때만 온다. 그 변수를
      안 받은 응답에서는 None 이다 — 없는 것과 0 은 다르다.
    """
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
                # 잔디 기준 증발산(mm/일). 안 받은 응답에서는 None
                "et0_mm": _at(daily.get("et0_fao_evapotranspiration"), i),
                # "2026-09-19T06:19" 그대로 둔다. 시각만 뽑는 것은 화면의 일이다
                "sunrise": _at(daily.get("sunrise"), i),
                "sunset": _at(daily.get("sunset"), i),
                "wind_dir_deg": _at(daily.get("wind_direction_10m_dominant"), i),
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
        # 바람이 **불어오는** 쪽(도). 값이 없으면 None — 0 은 정북풍이라 뜻이 다르다
        "windDirDeg": current.get("wind_direction_10m"),
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
