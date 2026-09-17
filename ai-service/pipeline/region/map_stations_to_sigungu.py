"""관측소(stations.csv) 를 시군구(sigungu.geojson) 에 붙여 data/ref/sigungu_station.csv 로 고정.

카카오 좌표->행정구역 API 를 쓰지 않는 이유: 그 API 의 코드는 법정동코드(예: 중구=11140)고
sigungu.geojson 의 코드는 통계청 행정구역코드(중구=11020)라 체계가 다르다. 코드로 잇지 않고
관측소 좌표가 어느 폴리곤 안에 있는지 직접 검사한다(point-in-polygon, ray casting) — 외부
키도 크로스워크 표도 필요 없다.

관측소가 하나도 안 걸리는 시군구(관측망이 성긴 도서·산간)는 시군구 무게중심에서 가장 가까운
관측소로 대체한다.

실행: py -3.12 -m pipeline.region.map_stations_to_sigungu
"""

import csv
import json
import math

from app.core.config import DATA_DIR
from pipeline.region.asos import asos_only

SIGUNGU_PATH = DATA_DIR / "ref" / "sigungu.geojson"
STATIONS_PATH = DATA_DIR / "stations.csv"
OUT_PATH = DATA_DIR / "ref" / "sigungu_station.csv"


def _point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _point_in_polygon(x, y, rings):
    """폴리곤 하나(외곽+구멍). 짝수 번 걸치면 구멍 안 = 바깥(even-odd)."""
    return sum(_point_in_ring(x, y, ring) for ring in rings) % 2 == 1


def point_in_feature(x, y, geometry):
    if geometry["type"] == "Polygon":
        return _point_in_polygon(x, y, geometry["coordinates"])
    return any(_point_in_polygon(x, y, poly) for poly in geometry["coordinates"])


def centroid(geometry):
    """정확한 면적 무게중심은 아니고 꼭짓점 평균 — 대체 관측소 찾기용이라 이 정도로 충분."""
    rings = (
        geometry["coordinates"]
        if geometry["type"] == "Polygon"
        else [ring for poly in geometry["coordinates"] for ring in poly]
    )
    points = [p for ring in rings for p in ring]
    return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)


def haversine_km(lon1, lat1, lon2, lat2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main() -> None:
    sigungu = json.loads(SIGUNGU_PATH.read_text(encoding="utf-8"))["features"]

    with STATIONS_PATH.open(encoding="utf-8-sig") as f:
        stations = list(csv.DictReader(f))

    # 평년값을 기대할 수 있는 관측소(ASOS)만 후보로 쓴다. AWS 를 후보에 넣으면 평년값이
    # 없어 지도가 회색이 되고, 반대로 normals 테이블로 이 판단을 하면 순환이 된다 —
    # 둘 다 겪은 뒤의 자리다. 이유 전체는 pipeline/region/asos.py 의 docstring.
    candidates = asos_only(stations)

    rows = []
    unmatched = []
    for feature in sigungu:
        props = feature["properties"]
        clon, clat = centroid(feature["geometry"])
        inside = [
            s
            for s in candidates
            if point_in_feature(float(s["lon"]), float(s["lat"]), feature["geometry"])
        ]

        if inside:
            station = min(
                inside, key=lambda s: haversine_km(clon, clat, float(s["lon"]), float(s["lat"]))
            )
            method = "contains"
        else:
            station = min(
                candidates,
                key=lambda s: haversine_km(clon, clat, float(s["lon"]), float(s["lat"])),
            )
            method = "nearest"
            unmatched.append(props["name"])

        rows.append(
            {
                "sigungu_code": props["code"],
                "sigungu_name": props["name"],
                "station": station["stn"],
                "station_name": station["name"],
                "method": method,
            }
        )

    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"{OUT_PATH} 에 {len(rows)}개 시군구 저장 (관측소 없어 대체: {len(unmatched)}개)")
    if unmatched:
        print("대체:", ", ".join(unmatched))


if __name__ == "__main__":
    main()
