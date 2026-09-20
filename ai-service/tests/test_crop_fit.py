"""`app/domain/crop_fit.py` — 실제 DB 필드만으로 낸 점수인지 확인한다.

`test_suitability.py` 가 없는 것과 대비된다 — 저 모듈은 애초에 DB 에 없는
이상 범위를 가정해서 못 붙였고, 이 모듈이 그 자리를 실제 데이터로 채운다.
"""

from datetime import date

from app.domain.crop_fit import CropCandidate, DailyWeather, HazardRule, SowWindow, rank_fits, score_fit

WARM_WEEK = tuple(DailyWeather(f"2026-04-{10 + i:02d}", 24.0, 14.0) for i in range(7))
COLD_WEEK = tuple(DailyWeather(f"2026-04-{10 + i:02d}", 8.0, 3.0) for i in range(7))


def _tomato(hazard_rules: tuple[HazardRule, ...] = ()) -> CropCandidate:
    return CropCandidate(
        crop_id=1,
        name_ko="방울토마토",
        base_temp_c=8.0,
        upper_temp_c=30.0,
        sow_windows=(SowWindow("04-01", "05-31"),),
        hazard_rules=hazard_rules,
    )


def test_in_window_warm_no_hazard_is_good():
    result = score_fit(_tomato(), "04-15", date(2026, 4, 15), WARM_WEEK)
    assert result.grade == "good"
    assert result.in_sowing_window is True
    assert result.risks == ()


def test_out_of_window_far_is_unsuitable():
    result = score_fit(_tomato(), "01-10", date(2026, 1, 10), WARM_WEEK)
    assert result.in_sowing_window is False
    assert result.grade == "unsuitable"


def test_out_of_window_but_soon_is_caution_not_unsuitable():
    # 04-01 시작, 오늘 03-25 → 7일 뒤 적기. "곧" 이라 완전 부적합보다는 낫다
    result = score_fit(_tomato(), "03-25", date(2026, 3, 25), WARM_WEEK)
    assert result.in_sowing_window is False
    assert result.grade == "caution"


def test_frost_hazard_breach_lowers_grade():
    frost = HazardRule("frost", "", "ta_min", "lte", 5.0)
    warm_but_frosty_night = (DailyWeather("2026-04-10", 20.0, 2.0),)
    result = score_fit(_tomato((frost,)), "04-15", date(2026, 4, 15), warm_but_frosty_night)
    assert "frost" in result.risks
    assert result.grade != "good"


def test_staged_hazard_rule_is_ignored_before_planting():
    """생육단계별 규칙(stage_name 있음)은 아직 안 심었으니 판단 근거가 아니다."""
    staged = HazardRule("heat", "개화착과기", "ta_max", "gte", 30.0)
    hot_days = (DailyWeather("2026-04-10", 35.0, 20.0),)
    result = score_fit(_tomato((staged,)), "04-15", date(2026, 4, 15), hot_days)
    assert result.risks == ()


def test_cold_pace_flags_slow_growth_without_breaching_grade_to_zero():
    result = score_fit(_tomato(), "04-15", date(2026, 4, 15), COLD_WEEK)
    assert "더딜" in result.note
    assert result.grade == "caution"


def test_rank_fits_sorts_by_score_desc():
    good = _tomato()
    bad = CropCandidate(2, "고추", 15.0, 33.0, (SowWindow("05-01", "05-31"),), ())
    ranked = rank_fits([bad, good], "04-15", date(2026, 4, 15), WARM_WEEK)
    assert [r.crop_id for r in ranked] == [1, 2]
    assert ranked[0].score >= ranked[1].score


if __name__ == "__main__":
    import sys

    import pytest

    sys.exit(pytest.main([__file__, "-q"]))
