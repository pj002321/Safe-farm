"""시군구 경계 참조 데이터와 좌표 → 시군구 코드 조회.

⚠️ **코드 체계가 둘이다. 절대 섞지 말 것.**

    sigungu.geojson 의 code   통계청 행정구역코드   중구 = 11020
    plots.region_code          법정동 코드(카카오)   중구 = 11140

앞 5자리를 잘라 맞추는 것은 **되지 않는다.** 두 공간은 겹치지도 않는다 —
geojson 쪽은 최대 39020 인데 법정동 쪽 농지 지역(경기~제주)은 41000 이상이라
아예 만나지 않고, 울산(법정동 31xxx)은 하필 경기도(통계청 31xxx)와 겹쳐서
**엉뚱한 도의 특보가 조용히 붙는다.** 실제로 그 버그를 한 번 냈다.

그래서 코드로 잇지 않고 **좌표가 어느 폴리곤 안에 있는지 직접 검사한다.**
pipeline/region/map_stations_to_sigungu.py 가 관측소를 붙일 때 쓰는 것과 같은
방법이고, 그 파일 문서에도 같은 이유가 적혀 있다.
"""

from __future__ import annotations

import json
from functools import lru_cache

from app.core.config import DATA_DIR
from app.domain.geo import geometry_bbox, point_in_geometry

SIGUNGU_PATH = DATA_DIR / "ref" / "sigungu.geojson"


@lru_cache(maxsize=1)
def sigungu_geojson() -> dict:
    """시군구 250개 경계. 3MB 라 요청마다 읽지 않는다(배포 중 바뀌지 않는 참조 데이터)."""
    return json.loads(SIGUNGU_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _bbox_index() -> tuple[tuple[str, tuple[float, float, float, float], dict], ...]:
    """(코드, 경계상자, geometry). 싼 사각형 검사로 후보를 먼저 줄인다."""
    return tuple(
        (
            feature["properties"]["code"],
            geometry_bbox(feature["geometry"]),
            feature["geometry"],
        )
        for feature in sigungu_geojson()["features"]
    )


def sigungu_code_at(lat: float, lon: float) -> str | None:
    """좌표가 속한 시군구의 **통계청 코드**. 어디에도 안 걸리면 None(바다·국외).

    ⚠️ 인자는 (위도, 경도) 순서, GeoJSON 은 (경도, 위도) 순서다. 아래에서 뒤집는다.
    """
    for code, (min_lon, min_lat, max_lon, max_lat), geometry in _bbox_index():
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            if point_in_geometry(lon, lat, geometry):
                return code
    return None
