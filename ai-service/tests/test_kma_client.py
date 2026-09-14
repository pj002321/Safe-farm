"""네트워크·DB 없이 순수 함수만 검증. fixture 는 실제 curl 로 받은 응답 그대로(2026-09-14)."""
from datetime import date

from pipeline.kma_client import (
    _kst_day_utc_range,
    _utc_windows,
    clean,
    normalize_alerts,
    normalize_weather_daily,
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


def test_clean_filters_missing():
    assert clean(-999) is None
    assert clean("-999") is None
    assert clean(None) is None
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


def test_utc_windows_respects_24_item_cap():
    # tm1~tm2 는 양끝 포함이라 한 창의 항목 수는 (길이/30분)+1 이어야 한다(실측 확인).
    start, end = _kst_day_utc_range(date(2026, 9, 13))
    windows = list(_utc_windows(start, end, interval_min=30, max_items=24))
    for w_start, w_end in windows:
        item_count = (w_end - w_start).total_seconds() / 60 / 30 + 1
        assert item_count <= 24
    assert windows[0][0] == start
    assert windows[-1][1] == end
