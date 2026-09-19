"""태풍 경로를 지도·조언이 쓰는 모양으로 정리한다. DB·HTTP 를 모르는 계산만 한다.

⚠ 예보는 점이 아니라 **원**이다. RAD(70% 확률반경)가 4일 뒤 290km 까지 커진다.
  "태풍이 옵니다" 가 아니라 "이 반경 안 어딘가로 예상됩니다" 가 자료가 말하는 것이다.
⚠ 거리는 하버사인으로 잰다. 위경도 차를 그대로 빼면 위도 35도에서 경도 1도가
  111km 가 아니라 91km 라, 동서로 20% 틀린다 — domain/geo.haversine_km 이 이미 있다.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.geo import haversine_km

# 경보를 낼 거리. 강풍반경(RAD15)이 없을 때만 쓰는 대체값이다.
# 기상청 강풍반경 중앙값이 300~500km 대라 그 하단을 잡았다.
FALLBACK_REACH_KM = 300.0


@dataclass(frozen=True)
class TyphoonPoint:
    ft: int  # 0 분석 · 1 예측
    at_utc: str
    lat: float
    lon: float
    pressure_hpa: float | None
    wind_ms: float | None
    rad15_km: float | None
    forecast_radius_km: float | None
    location_ko: str


def split_track(rows):
    """
    # summary
    한 응답을 분석 구간과 예측 구간으로 가른다. 지도가 실선/점선을 따로 그리려면 필요하다.

    # params
    rows: fetch_typhoon_track 결과<br>

    # returns
    (분석 점들, 예측 점들). 각각 시각 오름차순. 태풍이 없으면 ([], [])
    """
    pts = sorted((TyphoonPoint(**_pick(r)) for r in rows), key=lambda p: p.at_utc)
    return [p for p in pts if p.ft == 0], [p for p in pts if p.ft == 1]


def closest_approach(points, lat, lon):
    """
    # summary
    예측 경로 중 이 좌표에 가장 가까워지는 점과 그 거리를 찾는다.
    밭 하나가 "언제 얼마나 가까워지나" 를 아는 것이 조언의 근거다.

    # params
    points: split_track 의 예측 구간<br>
    lat, lon: 밭 좌표<br>

    # returns
    (TyphoonPoint, 거리 km). 예측이 없으면 None
    """
    if not points:
        return None
    return min(((p, haversine_km(lat, lon, p.lat, p.lon)) for p in points), key=lambda x: x[1])


def reaches(point, distance_km):
    """그 시점의 강풍반경(없으면 FALLBACK_REACH_KM) 안에 드는가.

    예보원(forecast_radius_km)까지 더하지 않는다 — 그건 '중심이 어디쯤' 의 불확실성이지
    바람이 부는 범위가 아니다. 둘을 더하면 온 나라가 늘 경보가 된다.
    """
    reach = point.rad15_km or FALLBACK_REACH_KM
    return distance_km <= reach


def _pick(row):
    return {
        "ft": row["ft"], "at_utc": row["ft_tm"], "lat": row["lat"], "lon": row["lon"],
        "pressure_hpa": row["pressure_hpa"], "wind_ms": row["wind_ms"],
        "rad15_km": row["rad15_km"], "forecast_radius_km": row["forecast_radius_km"],
        "location_ko": row["location_ko"],
    }
