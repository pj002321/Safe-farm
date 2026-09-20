"""
---------------------------------------------
[Feature]: 숙기(조생·중생·만생) 추천

[Description]
- `resolveVariantIds`(Next, `cropStore.ts`, 2026-09-18)는 사용자가 숙기를
  안 고르면 위치·기후와 무관하게 무조건 중생 우선으로 정한다 — "가장 보편적"
  이라는 이유뿐이다. 여기는 그 자리를, 파종일부터 평년 기후로 쌓이는 GDD가
  각 숙기의 목표(`gdd_target`)를 채우는지로 바꾼다.
- `crop_fit.py`와 같은 원칙 — LLM 은 안 들어온다. 숫자는 전부 이 함수가 낸다.
- 판정: 숙기마다 "파종일부터 `days_to_harvest`일 동안 평년 기후로 쌓일 GDD"를
  구해, 목표를 채우는 숙기 중 **가장 늦은(=오래 크는) 것**을 고른다. 하나도
  못 채우면 목표가 가장 낮은(=가장 이른) 숙기로 안전하게 내린다 — 서리 전에
  못 여무는 것보다 낫다.

[Usage]
```python
pick_maturity(
    [VariantCandidate(1, "EARLY", 1000, 90), VariantCandidate(2, "LATE", 1400, 130)],
    base_temp_c=8.0, upper_temp_c=30.0,
    sow_date=date(2026, 4, 1), normals_by_day={(4, 1): (18.0, 8.0), ...},
)
```
---------------------------------------------
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.gdd import daily_gdd


@dataclass(frozen=True, slots=True)
class VariantCandidate:
    variant_id: int
    maturity_type: str  # EARLY | MID | LATE
    gdd_target: int
    days_to_harvest: int


def _normal_gdd_over(
    base_temp_c: float,
    upper_temp_c: float | None,
    start: date,
    days: int,
    normals_by_day: dict[tuple[int, int], tuple[float, float]],
) -> float:
    """`start` 부터 `days`일, 평년값으로 쌓이는 누적 GDD. 그 날짜의 평년값이
    없으면(월,일 결측) 그날은 0으로 본다 — 있는 날만으로 낸 값이라 실제보다
    낮게 잡힐지언정, 지어낸 값보다 안전한 쪽이다."""
    total = 0.0
    d = start
    for _ in range(days):
        pair = normals_by_day.get((d.month, d.day))
        if pair:
            total += daily_gdd(pair[0], pair[1], base_temp_c, upper_temp_c)
        d += timedelta(days=1)
    return total


def pick_maturity(
    candidates: list[VariantCandidate],
    base_temp_c: float,
    upper_temp_c: float | None,
    sow_date: date,
    normals_by_day: dict[tuple[int, int], tuple[float, float]],
) -> VariantCandidate | None:
    """감당되는 숙기 중 가장 늦은 것. 판단 근거(후보 2개 미만·평년값 없음)가
    없으면 None — 부르는 쪽이 기존 기본값(중생 우선)에 맡긴다."""
    if len(candidates) < 2 or not normals_by_day:
        return None

    feasible = [
        c
        for c in candidates
        if _normal_gdd_over(base_temp_c, upper_temp_c, sow_date, c.days_to_harvest, normals_by_day)
        >= c.gdd_target
    ]
    if feasible:
        return max(feasible, key=lambda c: c.gdd_target)
    return min(candidates, key=lambda c: c.gdd_target)
