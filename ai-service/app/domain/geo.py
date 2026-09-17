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