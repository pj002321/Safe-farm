"""기상청 API허브 호출 + 정규화. DB 의존 없음 (docs/DOMAIN_REF.md §1,3,4-B, §6 매핑 그대로).

엔드포인트별 응답 포맷은 실제 curl 로 확인한 값을 기준으로 한다:
- 일통계(arcltr_sfc_day)      disp=2 → {"result":"ok","data":[...]}
- 특보현황(wrn_now_data_new)  disp=1 → 맨 배열 [...] (disp=2 는 XML 로 깨짐 — 쓰지 말 것)
- 천리안 LST(nph-arcltr_sat_txt) disp=2 → [{"TM_INT0":.., "TM_INT1":..}] · 호출당 최대 24개 구간
- 평년값(arcltr_sfc_norm)     disp=2 → {"data":[...]} · 결측치는 -99.9 (weather_daily 의 -999 와 다름, 실측 확인)
- 절기재해(arcltr_solar_term_crop) disp=2 → {"data":[...]} · risk=01 필드만 확인됨(DOMAIN_REF §3)
- 격자변환(nph-dfs_xy_lonlat) → JSON 아님, 고정폭 텍스트(실측 확인)
"""
import math
from datetime import date, datetime, timedelta

import requests

TYP01_URL = "https://apihub.kma.go.kr/api/typ01/url"
CGI_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url"

LST_MAX_ITEMS = 24  # "위성영상 최대 출력 개수 제한 : 24개" (실측 확인)


def clean(v, missing_below=-900):
    """결측치(엔드포인트마다 sentinel 이 다름 — weather_daily -999, 평년값 -99.9) → None."""
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):  # 천리안 LST 는 결측을 문자열 "nan"으로도 준다(실측 확인)
        return None
    return None if v <= missing_below else v


def _get(url, params, timeout=30):
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


def fetch_weather_daily(api_key, stn, tm1, tm2):
    """지상관측 일통계. tm1/tm2 = 'yyyymmdd'(KST)."""
    resp = _get(
        f"{TYP01_URL}/arcltr_sfc_day.php",
        {"authKey": api_key, "stn": stn, "tm1": tm1, "tm2": tm2, "disp": 2},
    )
    return resp["data"]


def fetch_warnings(api_key):
    """특보현황 — 현재 전국 발효 특보 전체. disp=1 이 실제로는 JSON 배열을 준다(disp=2 는 XML)."""
    return _get(
        f"{TYP01_URL}/wrn_now_data_new.php",
        {"authKey": api_key, "fe": "f", "tm": "", "disp": 1, "help": 0},
    )


def _fetch_lst_chunk(api_key, lat, lon, tm1, tm2, interval=30):
    """단일 호출. tm1/tm2 = 'yyyymmddHHMM'(UTC), 구간 수 <= LST_MAX_ITEMS 로 호출자가 보장."""
    resp = _get(
        f"{CGI_URL}/nph-arcltr_sat_txt",
        {
            "authKey": api_key,
            "tm1": tm1,
            "tm2": tm2,
            "int": interval,
            "lat": lat,
            "lon": lon,
            "varn": "LST",
            "disp": 2,
        },
    )
    return resp[0] if resp else {}


def _kst_day_utc_range(kst_day: date):
    """KST 00:00~24:00 하루를 UTC 로 변환 (KST = UTC+9, DOMAIN_REF §3-④ 주의사항)."""
    start = datetime(kst_day.year, kst_day.month, kst_day.day) - timedelta(hours=9)
    return start, start + timedelta(days=1)


def _utc_windows(start, end, interval_min, max_items):
    """tm1~tm2 구간은 양끝 포함이라 항목 수 = (분수/interval)+1 (실측 확인). max_items 를 넘기지 않게 한 칸 적게 끊는다."""
    step = timedelta(minutes=interval_min * (max_items - 1))
    cur = start
    while cur < end:
        nxt = min(cur + step, end)
        yield cur, nxt
        cur = nxt


def fetch_daily_lst_min(api_key, lat, lon, kst_day: date, interval=30):
    """천리안 LST 를 KST 하루치 모아 최솟값(서리 판정용)을 반환. 관측 없으면 None."""
    start, end = _kst_day_utc_range(kst_day)
    values = []
    for w_start, w_end in _utc_windows(start, end, interval, LST_MAX_ITEMS):
        chunk = _fetch_lst_chunk(
            api_key, lat, lon, w_start.strftime("%Y%m%d%H%M"), w_end.strftime("%Y%m%d%H%M"), interval
        )
        values.extend(parse_lst_values(chunk))
    return min(values) if values else None


def parse_lst_values(chunk: dict):
    """{"TM_INT0": "17.4", ...} 형태에서 유효값만 뽑는다."""
    out = []
    for key, v in chunk.items():
        if key.startswith("TM_INT"):
            c = clean(v)
            if c is not None:
                out.append(c)
    return out


def normalize_weather_daily(rows):
    """arcltr_sfc_day 의 data 배열 → weather_daily 컬럼 (DATA_SCHEMA §3)."""
    out = []
    for r in rows:
        out.append(
            {
                "date": datetime.strptime(r["TM"], "%Y%m%d").date(),
                "tmax": clean(r.get("TA_MAX")),
                "tmin": clean(r.get("TA_MIN")),
                "tmean": clean(r.get("TA_DAY")),
                "rain": clean(r.get("RN_DAY")),
                "wind_max": clean(r.get("WS_MAX")),
            }
        )
    return out


def fetch_normals(api_key, stn, tmst=2021, norm="D", mm1=1, dd1=1, mm2=12, dd2=31):
    """지상관측 평년값(1991~2020, tmst=2021). DOMAIN_REF §2."""
    resp = _get(
        f"{TYP01_URL}/arcltr_sfc_norm.php",
        {
            "authKey": api_key, "stn": stn, "norm": norm, "tmst": tmst,
            "MM1": mm1, "DD1": dd1, "MM2": mm2, "DD2": dd2, "disp": 2,
        },
    )
    return resp["data"]


def fetch_solar_term_crop(api_key, stn, risk, solar_term, yy1, yy2):
    """절기별 작물재해 기준값. risk=01(저온) 만 필드가 확인됨(DOMAIN_REF §3)."""
    resp = _get(
        f"{TYP01_URL}/arcltr_solar_term_crop.php",
        {
            "authKey": api_key, "stn": stn, "risk": risk, "solar_term": solar_term,
            "YY1": yy1, "YY2": yy2, "disp": 2,
        },
    )
    return resp["data"]


def parse_grid_xy(text):
    """nph-dfs_xy_lonlat 의 고정폭 텍스트 응답에서 (nx, ny) 를 뽑는다(JSON 아님, 실측 확인)."""
    for line in text.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        _lon, _lat, nx, ny = (p.strip() for p in line.split(","))
        return int(nx), int(ny)
    return None


def fetch_grid_xy(api_key, lat, lon):
    """위경도 → 기상청 예보 격자(nx, ny)."""
    r = requests.get(
        f"{CGI_URL}/nph-dfs_xy_lonlat",
        params={"authKey": api_key, "lon": lon, "lat": lat, "help": 0},
        timeout=30,
    )
    r.raise_for_status()
    return parse_grid_xy(r.text)


def normalize_normals(rows, source="kma"):
    """arcltr_sfc_norm 의 data 배열 → normals 컬럼 (DATA_SCHEMA §3). 결측치는 -99.9(실측 확인)."""
    out = []
    for r in rows:
        out.append(
            {
                "station": str(r["STN_ID"]),
                "month": int(r["MM"]),
                "day": int(r["DD"]),
                "tmax_normal": clean(r.get("TA_MAX"), missing_below=-90),
                "tmin_normal": clean(r.get("TA_MIN"), missing_below=-90),
                "rain_normal": clean(r.get("RN"), missing_below=-90),
                "source": source,
            }
        )
    return out


def normalize_disaster_rule(rows, station, risk, solar_term, crop_id=""):
    """arcltr_solar_term_crop 의 연도별 data 배열 → disaster_rules 한 행(다년 평균).

    DATA_SCHEMA.md 는 station 컬럼이 없지만 응답 자체가 관측소 단위라 없으면 값을
    구분할 수 없어 추가했다. crop_id 도 문서상 nullable 이지만, Postgres UNIQUE
    제약은 NULL 끼리도 서로 다르게 취급해 upsert 멱등성이 깨지므로 "작물 무관"은
    빈 문자열로 표시한다(둘 다 의도적 이탈).
    """
    ta_mins = [v for v in (clean(r.get("TA_MIN")) for r in rows) if v is not None]
    tg_mins = [v for v in (clean(r.get("TG_MIN")) for r in rows) if v is not None]
    return {
        "station": str(station),
        "risk": risk,
        "solar_term": solar_term,
        "crop_id": crop_id,
        "ta_min": sum(ta_mins) / len(ta_mins) if ta_mins else None,
        "tg_min": sum(tg_mins) / len(tg_mins) if tg_mins else None,
        "sample_years": len(rows),
    }


def normalize_alerts(records):
    """wrn_now_data_new 의 배열 → official_alerts 컬럼 (DATA_SCHEMA §3)."""
    out = []
    for rec in records:
        out.append(
            {
                "reg_id": rec.get("REG_ID"),
                "reg_ko": rec.get("REG_KO"),
                "wrn": rec.get("WRN"),
                "lvl": rec.get("LVL"),
                "tm_fc": rec.get("TM_FC"),
                "tm_ef": rec.get("TM_EF"),
                "cmd": rec.get("CMD"),
                "raw": rec,
            }
        )
    return out
