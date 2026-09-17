"""좌표 → 시군구 코드. 실제 참조 데이터(sigungu.geojson)를 그대로 쓴다.

이 파일이 있는 이유는 하나다. 예전에 `plots.region_code[:5]` 로 시군구를 찾았는데,
그건 **법정동 코드**이고 특보 표는 **통계청 코드**라 체계가 달랐다. 전국 농지에서
특보가 조용히 안 뜨고, 울산 밭에는 경기도 특보가 붙었다. 예외도 로그도 없었다.
그래서 "코드를 자르지 않는다"를 코드가 아니라 **테스트로** 박아 둔다.
"""

import pytest

from app.domain.geo import geometry_bbox, point_in_geometry, point_in_ring
from app.service.sigungu_ref import sigungu_code_at, sigungu_geojson

# (이름, 위도, 경도) — 각 시군구 청사 근처 좌표.
KNOWN_POINTS = [
    ("상주시", 36.4150, 128.1590),
    ("울산광역시 중구", 35.5694, 129.3325),
    ("제주시", 33.4996, 126.5312),
    ("종로구", 37.5735, 126.9790),
    ("강릉시", 37.7519, 128.8761),
    ("해남군", 34.5733, 126.5988),
]


@pytest.mark.parametrize(("name", "lat", "lon"), KNOWN_POINTS)
def test_known_points_resolve_to_a_sigungu(name, lat, lon):
    """청사 좌표는 반드시 어딘가에 걸린다. None 이면 특보가 조용히 사라진다."""
    code = sigungu_code_at(lat, lon)
    assert code is not None, f"{name} 좌표가 어느 시군구에도 안 걸렸다"

    by_code = {f["properties"]["code"]: f["properties"]["name"] for f in sigungu_geojson()["features"]}
    assert code in by_code
    # 이름까지 맞는지 본다 — 코드만 보면 "뭔가 나오긴 했다"에서 멈춘다.
    assert by_code[code] in name or name in by_code[code], (
        f"{name} 좌표가 {by_code[code]}({code}) 로 잡혔다"
    )


def test_ulsan_does_not_resolve_to_gyeonggi():
    """실제로 났던 버그. 법정동 31110(울산 중구) 을 잘라 쓰면 통계청 31110(과천시)이 나왔다."""
    code = sigungu_code_at(35.5694, 129.3325)
    by_code = {f["properties"]["code"]: f["properties"]["name"] for f in sigungu_geojson()["features"]}
    assert by_code[code] != "과천시"
    assert "울산" in by_code[code] or "중구" in by_code[code]


def test_farmland_provinces_are_reachable_at_all():
    """법정동 코드 자르기로는 41000 이상이 통계청 표에 아예 없어 전부 None 이었다.
    좌표 방식이 그 지역들을 실제로 찾아내는지 본다."""
    for name, lat, lon in [
        ("경기 수원", 37.2636, 127.0286),
        ("강원 원주", 37.3422, 127.9202),
        ("충북 청주", 36.6424, 127.4890),
        ("전북 전주", 35.8242, 127.1480),
        ("경남 진주", 35.1800, 128.1076),
        ("제주 서귀포", 33.2541, 126.5601),
    ]:
        assert sigungu_code_at(lat, lon) is not None, f"{name} 을 못 찾았다"


def test_sea_returns_none():
    """동해 한가운데. 없는 것을 있다고 하면 안 된다."""
    assert sigungu_code_at(37.0, 132.0) is None


def test_coordinate_order_is_not_swapped():
    """위경도를 뒤집어 넣으면 한국이 태평양으로 간다 — 아무 데도 안 걸려야 한다."""
    # 상주 좌표를 뒤집은 값(위도 128 은 존재하지도 않는다).
    assert sigungu_code_at(128.1590, 36.4150) is None


def test_point_in_ring_basic_square():
    square = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    assert point_in_ring(5, 5, square)
    assert not point_in_ring(15, 5, square)
    assert not point_in_ring(5, 15, square)


def test_point_in_geometry_handles_hole():
    """도넛 모양. 구멍 안은 바깥이다(even-odd)."""
    outer = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    hole = [(4.0, 4.0), (6.0, 4.0), (6.0, 6.0), (4.0, 6.0)]
    geometry = {"type": "Polygon", "coordinates": [outer, hole]}
    assert point_in_geometry(1, 1, geometry)
    assert not point_in_geometry(5, 5, geometry)


def test_geometry_bbox():
    geometry = {"type": "Polygon", "coordinates": [[(1.0, 2.0), (5.0, 2.0), (5.0, 8.0), (1.0, 8.0)]]}
    assert geometry_bbox(geometry) == (1.0, 2.0, 5.0, 8.0)
