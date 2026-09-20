"""`domain.variant_fit.pick_maturity` — 평년 기후로 숙기(조·중·만생) 고르는 로직."""

from datetime import date

from app.domain.variant_fit import VariantCandidate, pick_maturity

EARLY = VariantCandidate(1, "EARLY", 500, 60)
LATE = VariantCandidate(2, "LATE", 1500, 120)

# 4/1부터 하루 GDD 10 씩 쌓이는 평년값(base_temp=0 이라 가정 시 10) — 60일=600, 120일=1200
NORMALS = {(m, d): (10.0, 10.0) for m in range(1, 13) for d in range(1, 29)}


def test_picks_highest_feasible_target():
    picked = pick_maturity([EARLY, LATE], base_temp_c=0.0, upper_temp_c=None,
                            sow_date=date(2026, 4, 1), normals_by_day=NORMALS)
    # 60일치 GDD=600 >= 500(feasible), 120일치=1200 < 1500(infeasible) -> EARLY 만 가능
    assert picked is EARLY


def test_falls_back_to_lowest_target_when_none_feasible():
    tiny = {k: (1.0, 1.0) for k in NORMALS}  # 하루 GDD 1 -> 둘 다 목표 미달
    picked = pick_maturity([EARLY, LATE], base_temp_c=0.0, upper_temp_c=None,
                            sow_date=date(2026, 4, 1), normals_by_day=tiny)
    assert picked is EARLY  # gdd_target 이 더 낮은 쪽


def test_no_normals_or_single_candidate_returns_none():
    assert pick_maturity([EARLY], 0.0, None, date(2026, 4, 1), NORMALS) is None
    assert pick_maturity([EARLY, LATE], 0.0, None, date(2026, 4, 1), {}) is None
