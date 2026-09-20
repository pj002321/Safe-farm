"""기상청 API허브 호출 + 정규화. DB 의존 없음 (docs/DOMAIN_REF.md §1,3,4-B, §6 매핑 그대로).

엔드포인트별 응답 포맷은 실제 curl 로 확인한 값을 기준으로 한다:
- 일통계(arcltr_sfc_day)      disp=2 → {"result":"ok","data":[...]}
- 특보현황(wrn_now_data_new)  disp=1 → 맨 배열 [...] (disp=2 는 XML 로 깨짐 — 쓰지 말 것)
- 천리안 LST(nph-arcltr_sat_txt) disp=2 → [{"TM_INT0":.., "TM_INT1":..}] · 호출당 최대 24개 구간
- 평년값(arcltr_sfc_norm)     disp=2 → {"data":[...]} · 결측치는 -99.9
  (weather_daily 의 -999 와 다름, 실측 확인)
- 절기재해(arcltr_solar_term_crop) disp=2 → {"data":[...]} · risk=01 필드만 확인됨(DOMAIN_REF §3)
- 격자변환(nph-dfs_xy_lonlat) → JSON 아님, 고정폭 텍스트(실측 확인)
"""
import math
from datetime import date, datetime, timedelta, timezone

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
    """tm1~tm2 구간은 양끝 포함이라 항목 수 = (분수/interval)+1 (실측 확인).

    max_items 를 넘기지 않게 한 칸 적게 끊는다.
    """
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
            api_key,
            lat,
            lon,
            w_start.strftime("%Y%m%d%H%M"),
            w_end.strftime("%Y%m%d%H%M"),
            interval,
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


# 평년값 기준연도 → normals.source. 기준이 다른 값을 같은 이름으로 담으면 "평년보다 몇 도"
# 계산이 지역마다 다른 잣대를 쓰게 된다 — 실측상 두 기준의 연평균 차이가 +0.3℃ 다.
# 관측소 이전으로 1991~2020 이 끊긴 곳(143 대구·146 전주)만 옛 기준을 쓴다.
NORMAL_SOURCE_BY_TMST = {2021: "kma", 2011: "kma-1981"}


def fetch_normals(api_key, stn, tmst=2021, norm="D", mm1=1, dd1=1, mm2=12, dd2=31):
    """지상관측 평년값. tmst=2021 은 1991~2020, tmst=2011 은 1981~2010. DOMAIN_REF §2.

    ⚠ ASOS 라고 다 있는 것은 아니다. 공항·레이더·도서·신설 관측소는 result=ok 에 data=[] 로
    답한다(2026-09-18 실측: ASOS 121개 중 37개). pipeline/region/asos.py docstring 참고.
    """
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
    """wrn_now_data_new 의 배열 → official_alerts 컬럼 (DATA_SCHEMA §3).

    REG_KO/WRN/LVL/CMD 는 고정폭 필드라 실측값에 트레일링 공백이 붙어 온다
    (예: "강풍  ", "발표"는 안 붙지만 "예비    "는 붙음) — strip 안 하면 이후
    == 비교(cmd == "해제" 등)가 전부 깨진다.
    """
    out = []
    for rec in records:
        out.append(
            {
                "reg_id": rec.get("REG_ID"),
                "reg_ko": (rec.get("REG_KO") or "").strip() or None,
                "wrn": (rec.get("WRN") or "").strip() or None,
                "lvl": (rec.get("LVL") or "").strip() or None,
                "tm_fc": rec.get("TM_FC"),
                "tm_ef": rec.get("TM_EF"),
                "cmd": (rec.get("CMD") or "").strip() or None,
                "raw": rec,
            }
        )
    return out


TYPHOON_URL = f"{TYP01_URL}/typ_now.php"

# 응답이 EUC-KR 이다. requests 가 UTF-8 로 짐작해 LOC("괌 북동쪽 …")가 깨진다.
# 다른 기상청 API 는 _get 이 JSON 으로 받아 문제가 없었는데, 이 엔드포인트만 평문이라
# 여기서 인코딩을 못박는다. 실제로 UnicodeDecodeError 로 한 번 터졌다.
TYPHOON_ENCODING = "euc-kr"

# 출력 19칸의 순서. disp=1 이면 이 순서로 쉼표 구분돼 온다(help=0 헤더는 '#' 로 시작).
_TYPHOON_COLS = (
    "ft", "yy", "typ", "seq", "tmd", "typ_tm", "ft_tm", "lat", "lon",
    "dir", "sp", "ps", "ws", "rad15", "rad25", "rad", "ed15", "er15", "loc",
)


def fetch_typhoon_track(api_key, tm=None):
    """
    # summary
    지금 진행 중인 태풍의 과거 분석 경로 + 최신 예측 경로를 한 번에 받는다.

    ⚠ tm 은 **UTC** 다. KST 를 넣으면 9시간 뒤를 묻는 꼴이라 빈손으로 온다 —
      _kst_day_utc_range 와 같은 함정이다.
    ⚠ mode=1 이 "과거 분석 + 가장 최근 예측" 이다. 0 은 예보가 빠져 지도에 점선이 안 생긴다.
    ⚠ 태풍이 없으면 **빈 리스트가 정상**이다. 문서의 보유기간이 "현재 진행 중인 태풍에 한하여" 다.

    # params
    api_key: KMA_API_KEY<br>
    tm: 기준시각(UTC, datetime). None 이면 지금<br>

    # returns
    dict 목록. ft=0 분석 · 1 예측이 시각 순으로 섞여 온다. 없으면 빈 리스트

    # examples
        fetch_typhoon_track(key)
        -> [{'ft': 0, 'typ_no': '25', 'lat': 16.5, 'lon': 149.3, 'pressure_hpa': 998, ...}, ...]
    """
    when = tm or datetime.now(timezone.utc)
    resp = requests.get(
        TYPHOON_URL,
        params={
            "tm": when.strftime("%Y%m%d%H%M"),
            "mode": 1,
            "disp": 1,  # 0 은 포트란 고정폭이라 자릿수로 잘라야 한다. 쓰지 말 것
            "help": 0,
            "authKey": api_key,
        },
        timeout=20,
    )
    resp.raise_for_status()
    resp.encoding = TYPHOON_ENCODING
    return parse_typhoon_rows(resp.text)


def parse_typhoon_rows(text):
    """쉼표 평문 → dict 목록. '#' 로 시작하는 헤더와 칸 수가 모자란 줄은 버린다."""
    rows = []
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        cells = [c.strip() for c in line.split(",")]
        if len(cells) < len(_TYPHOON_COLS):
            continue
        row = dict(zip(_TYPHOON_COLS, cells))
        rows.append(
            {
                "ft": int(row["ft"]),
                "typ_no": row["typ"],
                "ft_tm": row["ft_tm"],
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "dir": row["dir"],
                # -999 는 결측이다. clean 이 이미 그 규칙을 안다(missing_below=-900)
                "speed_kmh": clean(row["sp"]),
                "pressure_hpa": clean(row["ps"]),
                "wind_ms": clean(row["ws"]),
                "rad15_km": clean(row["rad15"]),
                "rad25_km": clean(row["rad25"]),
                "forecast_radius_km": clean(row["rad"]),
                "location_ko": row["loc"],
            }
        )
    return rows
