"""Copernicus Data Space(Sentinel Hub) Statistical API 호출 + 정규화. DB 의존 없음.

무료 API 다. OAuth 클라이언트 자격증명(SH_CLIENT_ID/SH_CLIENT_SECRET)으로 토큰을 받고,
폴리곤 + 기간 + evalscript 를 한 번에 던지면 **날짜별 통계(평균)를 바로 받는다** —
타일 이미지를 내려받아 우리가 직접 계산할 필요가 없다.

좌표 하나만으로는 통계 폴리곤이 안 된다(Statistical API 는 Point 를 받지 않는다).
`bbox_polygon` 으로 픽셀 몇 개짜리 정사각형을 만들어 감싼다.

★ **원천을 갈아끼울 수 있게 인터페이스를 좁게 둔다.**

  이 모듈이 밖으로 내보내는 것은 `[{"date", "ndvi", "ndmi"}]` **하나뿐**이다.
  밴드(B04·B08·B11)·evalscript·Statistical API·OAuth 는 전부 이 파일 안에만 있다.
  **원천이 바뀌어도 이 파일만 바뀐다** — 부르는 쪽(app/api/satellite.py)은 그대로다.

  왜 그렇게 두는가 — **2027년 농림위성**(차세대중형위성 4호)이 가동하면 옮길 수 있다.

      Sentinel-2   10m · 재방문 5일 · 구름에 약해 **실효 18일**(아래 실측)
      농림위성      5m급 · 재방문 3일 · 국내 전용

  ⚠ 이 주석을 지우지 말 것. 이 프로젝트의 기획 동기가 국내 농림위성이고,
    그 사실을 아는 사람이 팀을 떠나면 아무도 모르게 된다.

⚠ **관측이 생각보다 드물다** (2026-09-19 실측 · 전남 무안 밭 3곳 · 90일)

      유효 관측 5건 · 평균 18일에 한 번
      간격  최소 5일 · 중앙 13일 · **최장 32일**(8/4 → 9/5)
      달별  7월 2 · 8월 1 · 9월 2        ← 장마철에 비어 있다

  재방문은 5일인데 `maxCloudCoverage: 60` 과 SCL 필터를 지나면 이만큼만 남는다.
  **부르는 쪽은 "값이 없는 날"을 정상으로 다뤄야 한다** — 위성은 더하는 신호지
  의존하는 신호가 아니다. 없으면 기상만으로 판정하면 된다.

  그래서 **'2주 전 대비' 같은 고정 간격을 쓰지 말 것.** 있는 것 중 가까운 둘을
  쓰고, 그 간격이 크게 벌어지면(예: 30일↑) 비교를 포기한다 — 한 달 전과 견주는 것은
  계절이 바뀐 것을 마름으로 읽는 일이다.

⚠ **화소(10m)가 텃밭보다 크지만, 걱정한 만큼 문제는 아니었다** (같은 날 실측)

  같은 밭을 반폭 5·15·30m 로 재서 값이 얼마나 출렁이는지 봤다.

      아빠 논  165m²  벼 자라는 중   NDVI +0.79  NDMI +0.38   폭 0.021  안정
      전기태   198m²  양파          NDVI +0.54  NDMI +0.14   폭 0.052
      집앞     60m²  참깨 추수 후    NDVI +0.27  NDMI −0.08   폭 0.092
      (견주기) 496m²  임의 좌표      NDVI −0.15  NDMI −0.35   폭 0.465 ★

  **면적 순서와 안정성 순서가 반대다.** 165m² 논이 496m² 보다 안정적이다 —
  논은 주변도 논이라 조회 영역이 넘어가도 같은 벼를 재기 때문이다.
  진짜 문제는 크기가 아니라 **좌표가 실제로 밭인가**다.

  값도 현실과 맞는다 — 추수한 밭이 가장 낮고 자라는 논이 가장 높다.
  출렁여도 뜻은 안 뒤집히므로, **절대값이 아니라 추세로** 보면 쓸 수 있다.
"""
from __future__ import annotations

import math
import time

import requests

TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)
STATISTICS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics"

# NDVI = (B08-B04)/(B08+B04), NDMI = (B08-B11)/(B08+B11). SCL(Scene Classification)로
# 구름·구름그림자·눈을 걸러 dataMask 에 곱한다 — 안 걸러진 화소는 지수를 뭉갠다.
# SCL 코드: 3=구름그림자, 8=구름(보통), 9=구름(높은확률), 10=권운.
_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1 },
      { id: "ndmi", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var clear = (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10) ? 0 : 1;
  return {
    ndvi: [index(s.B08, s.B04)],
    ndmi: [index(s.B08, s.B11)],
    dataMask: [s.dataMask * clear]
  };
}
"""

_M_PER_DEGREE_LAT = 111_320  # 위도 1도의 대략적인 거리(m). 지구가 완전한 구는 아니지만 밭 단위 폴리곤엔 충분하다.

_token_cache: dict = {"value": None, "expires_at": 0.0}


def bbox_polygon(lat: float, lon: float, half_width_m: float = 15) -> dict:
    """
    # summary
    좌표 하나를 한 변 `half_width_m*2`m 짜리 정사각형 GeoJSON 폴리곤으로 감싼다.
    Sentinel-2 픽셀이 10m 라 기본값(반폭 15m)이면 3x3 픽셀 정도를 본다.

    # params
    lat, lon: 중심 좌표<br>
    half_width_m: 중심에서 변까지 거리(m)<br>

    # returns
    GeoJSON Polygon (경도, 위도 순서 — GeoJSON 표준)

    # examples
        bbox_polygon(35.298, 127.316)["type"]  -> "Polygon"
    """
    lat_deg = half_width_m / _M_PER_DEGREE_LAT
    lon_deg = half_width_m / (_M_PER_DEGREE_LAT * math.cos(math.radians(lat)))
    return {
        "type": "Polygon",
        "coordinates": [[
            [lon - lon_deg, lat - lat_deg],
            [lon + lon_deg, lat - lat_deg],
            [lon + lon_deg, lat + lat_deg],
            [lon - lon_deg, lat + lat_deg],
            [lon - lon_deg, lat - lat_deg],
        ]],
    }


def _client_credentials_token(client_id: str, client_secret: str) -> str:
    """토큰을 프로세스 안에 캐시한다. 만료 60초 전에 미리 새로 받는다."""
    if _token_cache["value"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["value"]

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    _token_cache["value"] = body["access_token"]
    _token_cache["expires_at"] = time.time() + body["expires_in"]
    return _token_cache["value"]


def _normalize_statistics(payload: dict) -> list[dict]:
    """Statistical API 응답 → 날짜별 [{"date", "ndvi", "ndmi"}]. 유효 관측만, 날짜 오름차순.

    구름 등으로 폴리곤 전체가 가려진 날은 `sampleCount == noDataCount`이고 값이
    문자열 "NaN"으로 온다 — 그대로 두면 화면이 깨지므로 여기서 건너뛴다.
    """
    points = []
    for row in payload.get("data", []):
        ndvi = row["outputs"]["ndvi"]["bands"]["B0"]["stats"]
        ndmi = row["outputs"]["ndmi"]["bands"]["B0"]["stats"]
        if ndvi["sampleCount"] == ndvi["noDataCount"]:
            continue
        points.append({
            "date": row["interval"]["from"][:10],
            "ndvi": ndvi["mean"],
            "ndmi": ndmi["mean"],
        })
    return points


def fetch_ndvi_ndmi_series(
    client_id: str,
    client_secret: str,
    lat: float,
    lon: float,
    date_from: str,
    date_to: str,
) -> list[dict]:
    """
    # summary
    좌표 하나(15m 반폭 정사각형)의 `date_from`~`date_to`(YYYY-MM-DD) NDVI·NDMI 일별
    평균. Sentinel-2 재방문 주기(5일)+구름 때문에 구간 안의 모든 날이 나오지 않는다.

    # params
    client_id, client_secret: Copernicus Data Space OAuth 클라이언트 자격증명<br>
    lat, lon: 밭 좌표<br>
    date_from, date_to: "YYYY-MM-DD", 양끝 포함<br>

    # returns
    [{"date": "YYYY-MM-DD", "ndvi": float, "ndmi": float}, ...] 날짜 오름차순. 유효
    관측이 없으면 빈 리스트

    # examples
        fetch_ndvi_ndmi_series(cid, secret, 35.298, 127.316, "2026-05-01", "2026-06-15")
        -> [{"date": "2026-05-01", "ndvi": 0.35, "ndmi": 0.09}, ...]
    """
    token = _client_credentials_token(client_id, client_secret)
    time_range = {"from": f"{date_from}T00:00:00Z", "to": f"{date_to}T23:59:59Z"}
    body = {
        "input": {
            "bounds": {
                "geometry": bbox_polygon(lat, lon),
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {"timeRange": time_range, "maxCloudCoverage": 60},
                }
            ],
        },
        "aggregation": {
            "timeRange": time_range,
            "aggregationInterval": {"of": "P1D"},
            "evalscript": _EVALSCRIPT,
            "resx": 10,
            "resy": 10,
        },
    }
    resp = requests.post(
        STATISTICS_URL,
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return _normalize_statistics(resp.json())
