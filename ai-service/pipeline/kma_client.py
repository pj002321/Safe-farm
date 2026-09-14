"""기상청 API허브 호출 + 정규화. DB 의존 없음 (docs/DOMAIN_REF.md §1,3,4-B, §6 매핑 그대로).

엔드포인트별 응답 포맷은 실제 curl 로 확인한 값을 기준으로 한다:
- 일통계(arcltr_sfc_day)      disp=2 → {"result":"ok","data":[...]}
- 특보현황(wrn_now_data_new)  disp=1 → 맨 배열 [...] (disp=2 는 XML 로 깨짐 — 쓰지 말 것)
- 천리안 LST(nph-arcltr_sat_txt) disp=2 → [{"TM_INT0":.., "TM_INT1":..}] · 호출당 최대 24개 구간
"""
from datetime import date, datetime, timedelta

import requests

TYP01_URL = "https://apihub.kma.go.kr/api/typ01/url"
CGI_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url"

LST_MAX_ITEMS = 24  # "위성영상 최대 출력 개수 제한 : 24개" (실측 확인)


def clean(v):
    """결측치 -999 → None. DOMAIN_REF §5 결측 처리."""
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if v <= -900 else v


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
