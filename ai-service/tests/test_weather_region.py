from app.domain.weather_region import classify_rain, classify_wind


def test_classify_rain_no_data_is_gray():
    assert classify_rain(None) == ("#d1d5db", "데이터 없음")


def test_classify_rain_zero_is_no_rain_not_no_data():
    color, label = classify_rain(0)
    assert label == "강수 없음"
    assert color != "#d1d5db"


def test_classify_rain_tiers_are_ordered():
    assert classify_rain(5)[1] == "약한 비"
    assert classify_rain(20)[1] == "보통 비"
    assert classify_rain(50)[1] == "강한 비"
    assert classify_rain(100)[1] == "매우 강한 비"


def test_classify_wind_no_data_is_gray():
    assert classify_wind(None) == ("#d1d5db", "데이터 없음")


def test_classify_wind_tiers_are_ordered():
    assert classify_wind(2)[1] == "약함"
    assert classify_wind(6)[1] == "약간 강함"
    assert classify_wind(12)[1] == "강함"
    assert classify_wind(16)[1] == "강풍주의보 수준"
    assert classify_wind(25)[1] == "강풍경보 수준"
