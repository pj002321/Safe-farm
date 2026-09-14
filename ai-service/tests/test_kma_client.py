"""네트워크·DB 없이 순수 함수만 검증. fixture 는 실제 curl 로 받은 응답 그대로(2026-09-14)."""
from datetime import date

from pipeline.kma_client import (
    _kst_day_utc_range,
    _utc_windows,
    clean,
    normalize_alerts,
    normalize_disaster_rule,
    normalize_normals,
    normalize_weather_daily,
    parse_grid_xy,
    parse_lst_values,
)

WEATHER_DAILY_ROWS = [
    {"TM": "20260913", "STN_ID": 137, "TA_DAY": -999, "TA_MAX": 28.8, "TA_MIN": 15.0, "RN_DAY": 0, "WS_MAX": 2.7},
    {"TM": "20260912", "STN_ID": 137, "TA_DAY": 20.6, "TA_MAX": 28.1, "TA_MIN": 15.1, "RN_DAY": 0, "WS_MAX": 1.5},
]

ALERT_RECORD = {
    "REG_UP": "L1070000", "REG_UP_KO": "경상북도", "REG_ID": "L1071200", "REG_KO": "상주",
    "TM_FC": "202609141100", "TM_EF": "202609141400", "WRN": "C", "LVL": "2", "CMD": "1",
}

LST_CHUNK = {
    "TM1": "202609121500", "TM2": "202609130230", "VAR": "LST",
    "TM_INT0": "17.4", "TM_INT1": "14.6", "TM_INT2": "13.1", "LAT": "36.4084", "LON": "128.1574",
}

NORMAL_ROWS = [
    {"TM_ST": 2021, "STN_ID": 137, "STN_KO": "상주", "LAT": 36.40837, "LON": 128.15741,
     "MM": 9, "DD": 1, "TA": 22.4, "TA_MAX": 27.4, "TA_MIN": 18.6, "RN": 10.8, "HM": 80,
     "CA_TOT": -99.9, "EV_S": -99.9, "SS": 4.6, "WS": 1.1},
    {"TM_ST": 2021, "STN_ID": 137, "STN_KO": "상주", "LAT": 36.40837, "LON": 128.15741,
     "MM": 9, "DD": 2, "TA": 22.4, "TA_MAX": 27.6, "TA_MIN": 18.3, "RN": 8.9, "HM": 79.6,
     "CA_TOT": -99.9, "EV_S": -99.9, "SS": 5.2, "WS": 1},
]

SOLAR_TERM_CROP_ROWS = [
    {"TM": "20220908", "STN_ID": 137, "STN_KO": "상주", "LAT": 36.40837, "LON": 128.15741,
     "TA_MIN": 13.1, "TA": 20.5, "TG_MIN": 12.1},
    {"TM": "20230908", "STN_ID": 137, "STN_KO": "상주", "LAT": 36.40837, "LON": 128.15741,
     "TA_MIN": 15.8, "TA": 22.2, "TG_MIN": 15.3},
]

GRID_XY_TEXT = "#START7777\n# LON, LAT, X, Y\n 128.157400, 36.408400, 82, 103\n"


def test_clean_filters_missing():
    assert clean(-999) is None
    assert clean("-999") is None
    assert clean(None) is None
    assert clean("nan") is None  # 천리안 LST 결측 표기 (실측 확인)
    assert clean("15.5") == 15.5
    assert clean(0) == 0


def test_normalize_weather_daily_maps_columns_and_missing():
    rows = normalize_weather_daily(WEATHER_DAILY_ROWS)
    assert rows[0]["date"] == date(2026, 9, 13)
    assert rows[0]["tmean"] is None  # -999 결측 필터링 확인 (당일 집계중, DOMAIN_REF §5-7)
    assert rows[1]["tmean"] == 20.6
    assert rows[1]["tmax"] == 28.1
    assert rows[1]["wind_max"] == 1.5


def test_normalize_alerts_keeps_raw():
    rows = normalize_alerts([ALERT_RECORD])
    assert rows[0]["reg_id"] == "L1071200"
    assert rows[0]["wrn"] == "C"
    assert rows[0]["raw"] == ALERT_RECORD


def test_parse_lst_values_ignores_non_interval_keys():
    values = parse_lst_values(LST_CHUNK)
    assert values == [17.4, 14.6, 13.1]


def test_kst_day_utc_range_is_minus_9_hours():
    start, end = _kst_day_utc_range(date(2026, 9, 13))
    assert start.isoformat() == "2026-09-12T15:00:00"
    assert end.isoformat() == "2026-09-13T15:00:00"


def test_clean_missing_below_is_configurable():
    assert clean(-99.9) == -99.9  # 기본 threshold(-900)로는 정상값
    assert clean(-99.9, missing_below=-90) is None  # 평년값 결측 sentinel


def test_normalize_normals_maps_columns_and_missing():
    rows = normalize_normals(NORMAL_ROWS)
    assert rows[0]["station"] == "137"
    assert rows[0]["month"] == 9 and rows[0]["day"] == 1
    assert rows[0]["tmax_normal"] == 27.4
    assert rows[0]["rain_normal"] == 10.8
    assert rows[1]["day"] == 2


def test_normalize_disaster_rule_averages_years():
    rule = normalize_disaster_rule(SOLAR_TERM_CROP_ROWS, station=137, risk="01", solar_term="15")
    assert rule["station"] == "137"
    assert rule["crop_id"] == ""  # 작물 무관 sentinel (NULL 이면 upsert 멱등성 깨짐)
    assert rule["sample_years"] == 2
    assert rule["ta_min"] == (13.1 + 15.8) / 2
    assert rule["tg_min"] == (12.1 + 15.3) / 2


def test_parse_grid_xy_reads_fixed_width_text():
    assert parse_grid_xy(GRID_XY_TEXT) == (82, 103)


def test_utc_windows_respects_24_item_cap():
    # tm1~tm2 는 양끝 포함이라 한 창의 항목 수는 (길이/30분)+1 이어야 한다(실측 확인).
    start, end = _kst_day_utc_range(date(2026, 9, 13))
    windows = list(_utc_windows(start, end, interval_min=30, max_items=24))
    for w_start, w_end in windows:
        item_count = (w_end - w_start).total_seconds() / 60 / 30 + 1
        assert item_count <= 24
    assert windows[0][0] == start
    assert windows[-1][1] == end
