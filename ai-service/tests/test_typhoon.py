from app.domain.typhoon import FALLBACK_REACH_KM, closest_approach, reaches, split_track

_ROWS = [
    {
        "ft": 0, "typ_no": "25", "ft_tm": "202609190600", "lat": 16.5, "lon": 149.3,
        "pressure_hpa": 998, "wind_ms": 20, "rad15_km": None, "forecast_radius_km": None,
        "location_ko": "괌 북동쪽 약 590 km 부근 해상",
    },
    {
        "ft": 1, "typ_no": "25", "ft_tm": "202609200600", "lat": 20.0, "lon": 128.0,
        "pressure_hpa": 985, "wind_ms": 30, "rad15_km": 200.0, "forecast_radius_km": 40.0,
        "location_ko": "오키나와 남동쪽 해상",
    },
    {
        "ft": 1, "typ_no": "25", "ft_tm": "202609210600", "lat": 33.0, "lon": 126.5,
        "pressure_hpa": 970, "wind_ms": 35, "rad15_km": None, "forecast_radius_km": 130.0,
        "location_ko": "제주도 남쪽 해상",
    },
]


def test_split_track_는_분석과_예측을_가른다():
    analysis, forecast = split_track(_ROWS)
    assert [p.ft for p in analysis] == [0]
    assert [p.ft for p in forecast] == [1, 1]


def test_split_track_이_없으면_빈_튜플():
    assert split_track([]) == ([], [])


def test_closest_approach_는_가장_가까운_점을_고른다():
    _, forecast = split_track(_ROWS)
    # 상주(36.41, 128.16) 기준 — 두 예측점 중 제주 남쪽(33.0, 126.5)이 더 가깝다
    point, distance = closest_approach(forecast, 36.41, 128.16)
    assert point.lat == 33.0
    assert distance > 0


def test_closest_approach_예측이_없으면_None():
    assert closest_approach([], 36.41, 128.16) is None


def test_reaches_는_강풍반경_안이면_참():
    _, forecast = split_track(_ROWS)
    with_radius = next(p for p in forecast if p.rad15_km == 200.0)
    assert reaches(with_radius, 199.0)
    assert not reaches(with_radius, 201.0)


def test_reaches_는_강풍반경_없으면_대체값을_쓴다():
    _, forecast = split_track(_ROWS)
    without_radius = next(p for p in forecast if p.rad15_km is None)
    assert reaches(without_radius, FALLBACK_REACH_KM - 1)
    assert not reaches(without_radius, FALLBACK_REACH_KM + 1)
