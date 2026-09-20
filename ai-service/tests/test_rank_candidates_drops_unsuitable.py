"""`rank_candidates` 노드가 unsuitable 등급을 뺀다.

사용자 지적(2026-09-20): 후보 16개가 다 철 지난 작물이어도 `rank_fits` 는
점수 그대로 정렬만 해서, 화면 상위 5개에 "부적합" 작물이 그대로 뜬다 —
추천이라 부를 근거가 없는데 목록엔 있는 셈. `rank_fits` 자체(도메인 순수 함수,
`test_crop_fit.py` 가 지킨다)는 그대로 두고, 이 노드에서만 거른다.
"""

from datetime import date

from app.domain.crop_fit import CropCandidate, DailyWeather, SowWindow
from app.graph.nodes import rank_candidates

WARM_WEEK = tuple(DailyWeather(f"2026-04-{10 + i:02d}", 24.0, 14.0) for i in range(7))


def _crop(crop_id: int, sow_from: str, sow_to: str) -> CropCandidate:
    return CropCandidate(crop_id, f"작물{crop_id}", 8.0, 30.0, (SowWindow(sow_from, sow_to),), ())


def test_unsuitable_candidates_are_dropped(monkeypatch):
    monkeypatch.setattr(
        "app.graph.nodes.date",
        type("D", (), {"today": staticmethod(lambda: date(2026, 4, 15))}),
    )

    good = _crop(1, "04-01", "04-30")  # 지금이 파종 적기 -> good
    unsuitable = _crop(2, "09-01", "09-30")  # 반년 뒤 -> unsuitable

    result = rank_candidates({"weather": WARM_WEEK, "candidates": [good, unsuitable]})

    assert [r.crop_id for r in result["ranked"]] == [1]


def test_all_unsuitable_yields_empty_ranked(monkeypatch):
    monkeypatch.setattr(
        "app.graph.nodes.date",
        type("D", (), {"today": staticmethod(lambda: date(2026, 4, 15))}),
    )

    only_unsuitable = _crop(2, "09-01", "09-30")

    result = rank_candidates({"weather": WARM_WEEK, "candidates": [only_unsuitable]})

    assert result["ranked"] == []
