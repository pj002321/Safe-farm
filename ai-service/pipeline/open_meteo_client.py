"""Open-Meteo 예보 호출 + 정규화. API 키 불필요, DB 의존 없음.

기상청 API허브(kma_client.py)는 격자 변환이 있어야 하고 바람 예보를 안 준다.
Open-Meteo 는 위경도 그대로 호출해 기온·강수·바람을 한 번에 준다 — 밭 단위
예보(/v1/weather/plot)엔 이걸 쓴다.

**현재 실황·시간별·일별을 한 번의 요청으로 받는다.** Open-Meteo 는 `current`,
`hourly`, `daily` 를 같은 호출에 함께 받을 수 있다. 셋을 따로 부르면 왕복이 셋이
되고 밭 수만큼 곱해진다 — 밭이 셋이면 3회가 9회가 된다.

**같은 자리 예보는 잠깐 들고 있는다**(`FORECAST_CACHE_TTL`). 화면은 밭마다 부르고
밭 총평은 사용자의 밭을 차례로 도는데, 예보는 시간 단위로만 바뀐다 — 한 사용자의
밭 셋이 같은 동네면 왕복이 셋에서 하나가 된다. 담기는 건 좌표와 공개 기상값뿐이라
사용자 정보가 섞이지 않는다.
"""
import copy
import threading
import time
from collections import OrderedDict

import requests

from app.core.config import FORECAST_CACHE_TTL

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# 시간별로 보여 줄 구간. 하루 앞을 보는 것이 목적이라 24로 둔다.
HOURLY_SPAN = 24

#: 캐시 키로 쓸 좌표 자릿수. 3자리면 100m 안쪽이라 같은 밭·이웃 밭이 한 칸에 든다.
#: 더 줄이면(2자리 ≈ 1km) 산 하나를 사이에 둔 자리가 같은 칸에 들어간다.
COORD_DIGITS = 3

#: 캐시에 둘 좌표 수. 배치가 전국을 돌 때 무한정 쌓이지 않게 오래된 것부터 버린다.
CACHE_MAX_ENTRIES = 256

_cache: OrderedDict = OrderedDict()
# 동기 엔드포인트는 스레드풀에서 돈다. dict 연산 하나하나는 원자적이어도
# "찾고 → 옮기고 → 버리고" 는 아니다. 잠금 범위는 dict 조작뿐이고 HTTP 는 밖이다.
_lock = threading.Lock()


def clear_forecast_cache():
    """캐시를 비운다. 테스트와, 예보를 억지로 새로 받아야 할 때만 쓴다."""
    with _lock:
        _cache.clear()


def _cached(key):
    """살아 있는 캐시 값의 사본. 없거나 수명이 다했으면 None.

    `FORECAST_CACHE_TTL` 이 0 이하면 캐시를 통째로 끈다 — 예보가 이상할 때
    캐시 탓인지 확인할 스위치가 필요하다.
    """
    if FORECAST_CACHE_TTL <= 0:
        return None
    with _lock:
        hit = _cache.get(key)
        if hit is None:
            return None
        stored_at, payload = hit
        # >= 인 이유: Windows 의 monotonic 은 15ms 단위라 TTL 을 아주 짧게 준
        # 테스트에서 경과가 정확히 0.0 으로 나온다. > 로 두면 그때 안 만료된다
        if time.monotonic() - stored_at >= FORECAST_CACHE_TTL:
            del _cache[key]
            return None
        
        # LRU 캐시를 목적으로 LR인 애를 맨 앞으로 보내게 됨 -> 풀방이면 처리 하려고
        _cache.move_to_end(key)
    # 사본을 준다. 원본을 그대로 주면 부르는 쪽이 한 번 손대는 순간 다음 요청까지
    # 같이 틀어지는데, 그 인과는 로그로 못 쫓는다. 수천 개 실수 복사라 비용은 없다.
    return copy.deepcopy(payload)


def _store(key, payload):
    if FORECAST_CACHE_TTL <= 0:
        return
    with _lock:
        _cache[key] = (time.monotonic(), payload)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def fetch_forecast(lat, lon, days=7, *, cache_key=None):
    """현재 실황 + 시간별 + 일별 예보를 한 번에. days 는 오늘 포함 조회 일수(최대 16).

    같은 좌표(`COORD_DIGITS` 자리 반올림)·같은 days 면 `FORECAST_CACHE_TTL` 초
    동안 앞서 받은 값을 그대로 준다. 동시에 들어온 요청은 각자 받아 온다 —
    막으려면 잠금을 HTTP 까지 넓혀야 하는데, 그러면 외부 API 가 느릴 때 뒷 요청이
    전부 거기 매달린다.

    **`cache_key` 를 주면 좌표 대신 그것으로 묶는다.** 좌표 반올림은 거리가 아니라
    고정 격자에 찍는 것이라, 2m 떨어진 두 밭이 칸 경계를 사이에 두면 갈린다. 실제로
    개발 DB 의 밭 23개가 좌표 칸 23개로 전부 갈려 **밭 사이 적중이 한 건도 없었다**
    (같은 밭을 새로고침할 때만 걸렸다). 기상청 예보 격자(`plots.grid_x/grid_y`)로
    묶으면 사용자 단위 왕복이 23 → 11 회가 된다.

    쓰는 쪽이 알아야 할 것 둘:

    - **셀을 먼저 데운 밭의 좌표가 그 셀의 기준점이 된다.** 격자→좌표 역변환이
      없어서 호출은 여전히 넘어온 lat/lon 으로 나간다. 예보 격자는 5km 이고
      Open-Meteo 모델 해상도가 1~11km 라 평지에서는 모델 아래로 묻히지만,
      산지는 셀 안에서 갈린다.
    - **좌표 키와 격자 키는 서로 다른 칸이다.** 같은 자리를 한쪽은 좌표로, 한쪽은
      격자로 부르면 외부 왕복이 두 번 난다. 지금 격자를 쓰는 건 밭을 차례로 도는
      `service/report.py` 뿐이다 — `/v1/weather/plot` 은 `plot_id` 없이도 불려서
      격자가 없을 수 있으므로 좌표 키로 둔다.

    시간별은 `forecast_days` 만큼 통째로 오고, 그중 지금 이후 구간만 쓴다
    (`normalize_hourly`). Open-Meteo 는 hourly 를 **오늘 00시부터** 주기 때문에
    그냥 앞에서 자르면 이미 지난 시간을 보여주게 된다.
    """
    # `days` 는 여기서만 붙인다. 부르는 쪽이 키에 같이 넣으면 days 를 바꿨을 때
    # 키만 옛날 값으로 남아 **다른 기간의 응답을 캐시에서 꺼내 준다.**
    # 좌표 키는 3-튜플, 격자 키는 태그가 붙은 4-튜플이라 섞이지 않는다.
    key = (
        (*cache_key, days)
        if cache_key is not None
        else (round(lat, COORD_DIGITS), round(lon, COORD_DIGITS), days)
    )
    hit = _cached(key)
    if hit is not None:
        return hit

    resp = requests.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
            "hourly": "temperature_2m,precipitation,precipitation_probability",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean",
            # ⚠️ **반드시 지정한다.** Open-Meteo 의 풍속 기본 단위는 km/h 다.
            #    빼먹으면 5.6 이 나오는데 실제로는 1.56 m/s 라, m/s 임계와 비교하는
            #    쪽(작업 가능 판정·방제 기준)이 **전부 "바람 셈"으로 판정된다.**
            #    실제로 그 버그를 냈다 — 7일 중 6일이 강풍으로 뜨고, 그 판정이
            #    비 안내보다 먼저라 진짜 비 오는 날의 안내가 묻혔다.
            #    docs/DOMAIN_REF.md:674 가 이미 경고해 둔 것이다.
            "wind_speed_unit": "ms",
            "timezone": "Asia/Seoul",
            "forecast_days": days,
        },
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()
    # 실패는 담지 않는다 — raise_for_status 를 지난 뒤에만 여기 온다.
    _store(key, payload)
    return copy.deepcopy(payload)


def fetch_daily_forecast(lat, lon, days=7, *, cache_key=None):
    """일별만 필요한 호출자를 위한 얇은 래퍼. 요청은 위와 같은 한 번이다(캐시 포함)."""
    return fetch_forecast(lat, lon, days, cache_key=cache_key)["daily"]


def grid_cache_key(grid_x, grid_y):
    """기상청 예보 격자 기준 캐시 키. `plots.grid_x/grid_y` 를 그대로 넣는다.

    `days` 는 넣지 않는다 — `fetch_forecast` 가 붙인다(그쪽 주석 참고).

    격자 값은 밭 등록 때 위경도에서 계산해 박아 둔 것이고, 밭 수정 화면은 이름과
    넓이만 고치게 막아 뒀다(`src/components/plot/PlotManageList.tsx`). 그래서
    좌표만 바뀌고 격자가 남는 일이 없다 — 키가 좌표와 어긋나지 않는다.
    """
    return ("grid", grid_x, grid_y)


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
