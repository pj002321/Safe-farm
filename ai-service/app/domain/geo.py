"""위경도 거리 계산. 밭에서 가장 가까운 관측소를 고를 때 쓴다.

pipeline/region/map_stations_to_sigungu.py 에 같은 공식이 있지만 그건 오프라인
배치 스크립트고, 여긴 요청마다 도는 순수 함수라 app/domain 에 따로 둔다.
"""

from __future__ import annotations

import math

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 좌표 사이 대권거리(km)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))

def point_in_ring(lon: float, lat: float, ring: list) -> bool:
    """고리(닫힌 선) 안에 점이 있는가. ray casting.

    GeoJSON 좌표는 **[경도, 위도]** 순서다. 위경도 순서로 넘기면 한국이 태평양
    한가운데로 가서 어떤 폴리곤에도 안 걸린다.
    """
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_polygon(lon: float, lat: float, rings: list) -> bool:
    """폴리곤 하나(외곽 + 구멍). 짝수 번 걸치면 구멍 안 = 바깥(even-odd)."""
    return sum(point_in_ring(lon, lat, ring) for ring in rings) % 2 == 1


def point_in_geometry(lon: float, lat: float, geometry: dict) -> bool:
    """Polygon / MultiPolygon 공통. 시군구 경계는 섬 때문에 대부분 MultiPolygon 이다."""
    if geometry["type"] == "Polygon":
        return point_in_polygon(lon, lat, geometry["coordinates"])
    return any(point_in_polygon(lon, lat, poly) for poly in geometry["coordinates"])


def geometry_bbox(geometry: dict) -> tuple[float, float, float, float]:
    """(min_lon, min_lat, max_lon, max_lat).

    250개 시군구의 꼭짓점을 합치면 8만 개다. 요청마다 전부 검사하지 않으려고
    싼 사각형 검사로 먼저 거른다 — 보통 후보가 한두 개로 줄어든다.
    """
    rings = (
        geometry["coordinates"]
        if geometry["type"] == "Polygon"
        else [ring for poly in geometry["coordinates"] for ring in poly]
    )
    lons = [p[0] for ring in rings for p in ring]
    lats = [p[1] for ring in rings for p in ring]
    return min(lons), min(lats), max(lons), max(lats)
