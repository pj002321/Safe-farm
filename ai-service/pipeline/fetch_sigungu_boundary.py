"""시군구 경계 TopoJSON을 받아 순수 GeoJSON으로 굳혀 data/ref/sigungu.geojson 에 고정.

출처: southkorea/southkorea-maps(github) kostat/2018 — 통계청 SGIS 원자료, 공공누리 1유형
(출처표시) 라이선스. 코드는 통계청 시군구 코드 5자리(예: "11010"=종로구).

TopoJSON 인 이유: 원본 GeoJSON(18MB)보다 simplify 된 topo 버전(약 550KB)이 브라우저
렌더링에 맞다. 그래서 매번 파싱하지 않고 한 번 GeoJSON 으로 펼쳐 커밋해 둔다
(정적 파일이라 정확도 열화가 매 실행마다 반복되지 않는다).

실행: py -3.12 -m pipeline.fetch_sigungu_boundary
"""

import json

import requests

from app.core.config import DATA_DIR

TOPOJSON_URL = (
    "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/"
    "kostat/2018/json/skorea-municipalities-2018-topo-simple.json"
)
OUT_PATH = DATA_DIR / "ref" / "sigungu.geojson"


def _decode_arc(arc, scale, translate):
    """delta 인코딩된 정수 좌표 하나의 arc를 (lon, lat) 리스트로 푼다."""
    x, y = 0, 0
    points = []
    for dx, dy in arc:
        x += dx
        y += dy
        points.append([x * scale[0] + translate[0], y * scale[1] + translate[1]])
    return points


def _ring(arc_indexes, arcs):
    """arc 인덱스 배열(음수면 반대 방향) 하나를 이어 붙여 폐곡선 좌표열을 만든다.

    이어 붙이는 arc 의 시작점은 앞 arc 의 끝점과 같다(topojson 스펙) — 중복이라 버린다.
    """
    coords = []
    for i in arc_indexes:
        arc = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
        coords.extend(arc if not coords else arc[1:])
    return coords


def topojson_to_geojson(topo):
    scale = topo["transform"]["scale"]
    translate = topo["transform"]["translate"]
    arcs = [_decode_arc(arc, scale, translate) for arc in topo["arcs"]]

    key = next(iter(topo["objects"]))
    features = []
    for geom in topo["objects"][key]["geometries"]:
        if geom["type"] == "Polygon":
            rings = [_ring(ring, arcs) for ring in geom["arcs"]]
            coordinates = rings
        elif geom["type"] == "MultiPolygon":
            coordinates = [[_ring(ring, arcs) for ring in polygon] for polygon in geom["arcs"]]
        else:
            raise ValueError(f"예상 밖 geometry 타입: {geom['type']}")

        features.append(
            {
                "type": "Feature",
                "properties": geom["properties"],
                "geometry": {"type": geom["type"], "coordinates": coordinates},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    topo = requests.get(TOPOJSON_URL, timeout=30).json()
    geojson = topojson_to_geojson(topo)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    print(f"{OUT_PATH} 에 {len(geojson['features'])}개 시군구 폴리곤 저장")


if __name__ == "__main__":
    main()
