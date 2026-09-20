"""네트워크 없이 순수 함수만 검증. fixture 는 실제 응답 형태 그대로."""

from pipeline.open_meteo_client import (
    daily_index_of,
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
        # 안 받은 칸은 None 이다 — 없는 것과 0 은 다르다
        "et0_mm": None,
        "sunrise": None,
        "sunset": None,
        "wind_dir_deg": None,
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
            "wind_direction_10m": 270,
        }
    ) == {
        "observedAt": "2026-09-17T09:00",
        "tempC": 21.3,
        "humidityPct": 62,
        "rainfallMm": 0.0,
        "windMs": 3.4,
        "windDirDeg": 270,
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


def test_forecast_request_pins_wind_unit_to_ms():
    """풍속 단위를 요청에 **박아 둔다**.

    Open-Meteo 기본은 km/h 다. 이 파라미터가 빠지면 값은 그대로 오고 타입도 맞아서
    아무도 못 알아채는데, m/s 임계와 비교하는 쪽이 전부 오판한다(7일 중 6일이
    강풍으로 뜬 적이 있다). 그래서 응답이 아니라 **요청**을 검사한다.
    """
    import inspect

    from pipeline import open_meteo_client

    source = inspect.getsource(open_meteo_client.fetch_forecast)
    assert '"wind_speed_unit": "ms"' in source


# 과거를 같이 받은 응답. `past_days=14` 를 주면 **맨 앞이 오늘이 아니다.**
PAST_DAILY_RESPONSE = {
    "time": ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"],
    "temperature_2m_max": [30.0, 29.0, 28.8, 27.1],
    "temperature_2m_min": [20.0, 19.0, 18.2, 17.5],
    "precipitation_sum": [0.0, 0.0, 0.0, 12.4],
    "precipitation_probability_max": [0, 0, 10, 80],
    "wind_speed_10m_max": [3.0, 4.0, 9.4, 21.6],
    "relative_humidity_2m_mean": [50, 52, 55, 78],
    "et0_fao_evapotranspiration": [4.1, 3.9, 3.5, 1.2],
}


def test_daily_index_of_finds_today_by_date_not_position():
    """`past_days` 를 주면 0 번이 오늘이 아니다 — 자리로 세면 조용히 지난날을 가리킨다."""
    assert daily_index_of(PAST_DAILY_RESPONSE, "2026-09-17") == 2
    assert daily_index_of(PAST_DAILY_RESPONSE, "2026-09-15") == 0


def test_daily_index_of_returns_none_when_absent():
    """응답에 그 날짜가 없으면 None. 호출자는 예보를 비운다 — 틀린 날을 내일이라 하지 않는다."""
    assert daily_index_of(PAST_DAILY_RESPONSE, "2026-01-01") is None
    assert daily_index_of({}, "2026-09-17") is None
    assert daily_index_of(None, "2026-09-17") is None


def test_normalize_daily_forecast_keeps_source_order():
    """받은 차례 그대로 편다. 과거를 걸러내지 않는다 — 어느 날인지는 date 칸이 말한다."""
    rows = normalize_daily_forecast(PAST_DAILY_RESPONSE)
    assert [r["date"] for r in rows] == PAST_DAILY_RESPONSE["time"]


def test_normalize_daily_forecast_maps_et0_when_present():
    rows = normalize_daily_forecast(PAST_DAILY_RESPONSE)
    assert rows[0]["et0_mm"] == 4.1
    assert rows[3]["et0_mm"] == 1.2


def test_forecast_request_defaults_past_days_to_zero():
    """화면 예보(`/v1/weather/plot`)가 이 함수를 그대로 쓴다.

    기본을 올리면 밭을 열 때마다 응답이 커지고 그만큼 느려진다. 과거가 필요한 쪽
    (하루 1회 배치)만 인자로 올린다. **요청을 검사한다** — 풍속 단위와 같은 까닭이다.
    """
    import inspect

    from pipeline import open_meteo_client

    sig = inspect.signature(open_meteo_client.fetch_forecast)
    assert sig.parameters["past_days"].default == 0
    sig2 = inspect.signature(open_meteo_client.fetch_daily_forecast)
    assert sig2.parameters["past_days"].default == 0


def test_해와_바람방향도_받아_온다():
    """★ 2026-09-19 — 아침에 밭에 나갈 때 보는 값(해 뜸·짐)과 바람 방향을 붙였다."""
    rows = normalize_daily_forecast(
        {
            **DAILY_RESPONSE,
            "sunrise": ["2026-09-17T06:17", "2026-09-18T06:18"],
            "sunset": ["2026-09-17T18:37", "2026-09-18T18:35"],
            "wind_direction_10m_dominant": [18, 320],
        }
    )
    assert rows[0]["sunrise"] == "2026-09-17T06:17"
    assert rows[0]["sunset"] == "2026-09-17T18:37"
    assert rows[1]["wind_dir_deg"] == 320


def test_실황_풍향은_0_도_살려_둔다():
    """0 은 정북풍이다. falsy 로 걸러 None 이 되면 화면이 방향을 못 그린다."""
    now = normalize_current(
        {
            "time": "2026-09-17T09:00",
            "temperature_2m": 21.3,
            "wind_speed_10m": 3.4,
            "wind_direction_10m": 0,
        }
    )
    assert now["windDirDeg"] == 0


def test_시각으로_hourly_값을_찾는다():
    """★ 배열 끝을 쓰면 **엿새 뒤 예보**를 읽는다.

    hourly 는 past_days 만큼 앞이 늘고 예보만큼 뒤가 늘어난다. 토양수분을 그렇게
    읽으면 오늘 흙이 아니라 다음 주 흙을 보고 카드를 낸다.
    """
    from pipeline.open_meteo_client import hourly_value_at

    h = {
        "time": ["2026-09-19T12:00", "2026-09-19T13:00", "2026-09-25T23:00"],
        "soil_moisture_9_to_27cm": [0.21, 0.19, 0.33],
    }
    assert hourly_value_at(h, "2026-09-19T13:00", "soil_moisture_9_to_27cm") == 0.19
    # 딱 그 시각이 없으면 그보다 앞선 마지막 값 — 앞으로의 값보다 지난 값이 낫다
    assert hourly_value_at(h, "2026-09-19T13:30", "soil_moisture_9_to_27cm") == 0.19


def test_그_시각보다_앞선_값이_없으면_None():
    """모름을 0 으로 치면 '흙이 말랐다' 가 된다."""
    from pipeline.open_meteo_client import hourly_value_at

    h = {"time": ["2026-09-19T12:00"], "soil_moisture_9_to_27cm": [0.21]}
    assert hourly_value_at(h, "2026-09-19T11:00", "soil_moisture_9_to_27cm") is None
    assert hourly_value_at({}, "2026-09-19T12:00", "x") is None
