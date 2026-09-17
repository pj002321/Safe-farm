"""네트워크 없이 순수 함수만 검증. fixture 는 실제 Statistical API 응답 형태 그대로
(2026-05-01, 곡성 좌표로 실제 호출해 확인한 값)."""
import math

from pipeline.sentinelhub_client import _normalize_statistics, bbox_polygon

STATISTICS_RESPONSE = {
    "data": [
        {
            "interval": {"from": "2026-05-01T00:00:00Z", "to": "2026-05-02T00:00:00Z"},
            "outputs": {
                "ndvi": {"bands": {"B0": {"stats": {
                    "min": 0.351, "max": 0.351, "mean": 0.351, "stDev": 0.0,
                    "sampleCount": 1, "noDataCount": 0,
                }}}},
                "ndmi": {"bands": {"B0": {"stats": {
                    "min": 0.086, "max": 0.086, "mean": 0.086, "stDev": 0.0,
                    "sampleCount": 1, "noDataCount": 0,
                }}}},
            },
        },
        {
            # 구름에 완전히 가린 날 — sampleCount == noDataCount, 값은 "NaN" 문자열로 온다.
            "interval": {"from": "2026-05-11T00:00:00Z", "to": "2026-05-12T00:00:00Z"},
            "outputs": {
                "ndvi": {"bands": {"B0": {"stats": {
                    "min": "NaN", "max": "NaN", "mean": "NaN", "stDev": "NaN",
                    "sampleCount": 1, "noDataCount": 1,
                }}}},
                "ndmi": {"bands": {"B0": {"stats": {
                    "min": "NaN", "max": "NaN", "mean": "NaN", "stDev": "NaN",
                    "sampleCount": 1, "noDataCount": 1,
                }}}},
            },
        },
        {
            "interval": {"from": "2026-05-16T00:00:00Z", "to": "2026-05-17T00:00:00Z"},
            "outputs": {
                "ndvi": {"bands": {"B0": {"stats": {
                    "min": 0.404, "max": 0.404, "mean": 0.404, "stDev": 0.0,
                    "sampleCount": 1, "noDataCount": 0,
                }}}},
                "ndmi": {"bands": {"B0": {"stats": {
                    "min": 0.217, "max": 0.217, "mean": 0.217, "stDev": 0.0,
                    "sampleCount": 1, "noDataCount": 0,
                }}}},
            },
        },
    ]
}


def test_normalize_statistics_drops_fully_clouded_days():
    points = _normalize_statistics(STATISTICS_RESPONSE)
    assert [p["date"] for p in points] == ["2026-05-01", "2026-05-16"]


def test_normalize_statistics_maps_mean_values():
    points = _normalize_statistics(STATISTICS_RESPONSE)
    assert points[0] == {"date": "2026-05-01", "ndvi": 0.351, "ndmi": 0.086}


def test_normalize_statistics_empty_when_no_data():
    assert _normalize_statistics({"data": []}) == []


def test_bbox_polygon_is_centered_square():
    polygon = bbox_polygon(35.298, 127.316, half_width_m=15)
    ring = polygon["coordinates"][0]
    assert ring[0] == ring[-1]  # 닫힌 폴리곤
    lons = [pt[0] for pt in ring]
    lats = [pt[1] for pt in ring]
    center_lon = (min(lons) + max(lons)) / 2
    center_lat = (min(lats) + max(lats)) / 2
    assert math.isclose(center_lon, 127.316, abs_tol=1e-6)
    assert math.isclose(center_lat, 35.298, abs_tol=1e-6)


def test_bbox_polygon_widens_longitude_near_poles():
    """위도가 높을수록(적도에서 멀수록) 같은 미터 폭이 더 큰 경도차가 된다
    (cos(lat) 로 나누므로) — 이걸 빼먹으면 고위도에서 폴리곤이 실제보다 좁아진다."""
    narrow = bbox_polygon(0, 127.316, half_width_m=15)
    wide = bbox_polygon(60, 127.316, half_width_m=15)
    narrow_width = narrow["coordinates"][0][1][0] - narrow["coordinates"][0][0][0]
    wide_width = wide["coordinates"][0][1][0] - wide["coordinates"][0][0][0]
    assert wide_width > narrow_width
