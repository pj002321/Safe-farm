from app.domain.geo import haversine_km


def test_haversine_km_same_point_is_zero():
    assert haversine_km(36.4084, 128.1574, 36.4084, 128.1574) == 0.0


def test_haversine_km_seoul_to_busan_roughly_325km():
    seoul = (37.5665, 126.9780)
    busan = (35.1796, 129.0756)
    assert 320 < haversine_km(*seoul, *busan) < 330