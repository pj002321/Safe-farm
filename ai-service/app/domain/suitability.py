"""
---------------------------------------------
[Feature]: 작물 생육 적합도 계산 (TS suitability.ts 의 Python 이식)

[Description]
- 제품의 심장이다. 점수·등급·리스크 판정 로직은 여기에만 둔다. 노드에 복제하지 말 것.
- 순수 함수만 둔다. DB·네트워크·LLM·LangGraph 의존성 0.
  그래서 그래프를 돌리지 않고 pytest 로 바로 검증된다.
- 지금은 TS `src/features/recommendation/domain/suitability.ts` 와 **같은 로직이 두 벌**이다.
  정본이 정해지기 전(archi_base.md 미결정 2)까지는 한쪽을 고치면 다른 쪽도 고친다.
  `tests/test_suitability.py` 는 TS 테스트와 같은 케이스라 두 구현이 일치하는지 보는 기준이다.
- 반올림에 `round()` 를 쓰지 않는다. Python round 는 은행가 반올림(88.5 → 88)이라
  JS `Math.round`(88.5 → 89)와 점수가 갈린다.
- `RiskKind` / `Grade` 값은 TS 와 같은 문자열(`"lowLight"`)을 쓴다. 응답으로 프론트에 그대로 나간다.

[Usage]
```python
tomato = CropProfile("tomato", "토마토", (18, 27), (40, 120), 6)
score_suitability(tomato, WeatherWindow(avg_temp_c=22, rainfall_mm=80, sunshine_hours=8))
# → SuitabilityResult(crop_id="tomato", score=100, grade="good", risks=[])
```
---------------------------------------------
"""

import math
from dataclasses import dataclass
from typing import Literal

Range = tuple[float, float]
"""[최소, 최대] 포함 구간."""

RiskKind = Literal["cold", "heat", "drought", "flood", "lowLight"]
Grade = Literal["good", "caution", "unsuitable"]


@dataclass(frozen=True, slots=True)
class WeatherWindow:
    """한 재배 구간의 관측/예보 요약값."""

    avg_temp_c: float  # 구간 평균 기온 (°C)
    rainfall_mm: float  # 구간 누적 강수량 (mm)
    sunshine_hours: float  # 일 평균 일조시간 (h)


@dataclass(frozen=True, slots=True)
class CropProfile:
    """작물이 요구하는 생육 조건."""

    id: str
    name_ko: str
    temp_range_c: Range
    rainfall_range_mm: Range
    min_sunshine_hours: float


@dataclass(frozen=True, slots=True)
class Risk:
    kind: RiskKind
    severity: float  # 허용 범위에서 벗어난 정도(0~1). 1이면 심각.


@dataclass(frozen=True, slots=True)
class SuitabilityResult:
    crop_id: str
    score: int  # 0~100. 높을수록 적합.
    grade: Grade
    risks: list[Risk]


def _deviation(value: float, range_: Range) -> float:
    """범위 밖으로 벗어난 정도를 0~1로 정규화한다. 범위 안이면 0."""
    
    # 위에서 range라는 자료형을 정했지만, tuple이기만 하면 되는 자료형이라 못잡을 수 있음
    # assert는 
    assert isinstance(range_, tuple) and len(range_) == 2, f"Range 아님: {range_!r}"
    low, high = range_
    if low <= value <= high:
        return 0
    span = high - low
    # span이 0이면(단일값 요구) 상대화가 불가능하므로 절대 편차를 1로 취급한다.
    if span <= 0:
        return 1
    distance = low - value if value < low else value - high
    return min(distance / span, 1)


def _round_half_up(value: float) -> int:
    """JS Math.round 와 같은 반올림. 점수는 음수가 아니므로 이것으로 충분하다."""
    return math.floor(value + 0.5)


def score_suitability(crop: CropProfile, weather: WeatherWindow) -> SuitabilityResult:
    """
    # summary
    작물 하나의 적합도를 계산한다. 감점은 세 축(기온·강수·일조)의 이탈도를 가중
    합산한다. 기온 가중치가 가장 높다 — 냉해·고온장해는 회복이 안 되지만 물은 관수로,
    빛은 시설로 어느 정도 보정할 수 있기 때문이다.

    # params
    crop: 작물이 요구하는 생육 조건<br>
    weather: 한 재배 구간의 기상 요약<br>

    # returns
    점수(0~100)와 등급, 걸린 위험 목록. risks 는 이탈한 축만 담으므로 전부 범위
    안이면 빈 리스트다. 순서는 기온 → 강수 → 일조로 고정

    # examples
        score_suitability(tomato, WeatherWindow(22, 80, 8))
        -> SuitabilityResult(crop_id='tomato', score=100, grade='good', risks=[])
    """
    risks: list[Risk] = []

    temp_dev = _deviation(weather.avg_temp_c, crop.temp_range_c)
    if temp_dev > 0:
        kind = "cold" if weather.avg_temp_c < crop.temp_range_c[0] else "heat"
        risks.append(Risk(kind, temp_dev))

    rain_dev = _deviation(weather.rainfall_mm, crop.rainfall_range_mm)
    if rain_dev > 0:
        kind = "drought" if weather.rainfall_mm < crop.rainfall_range_mm[0] else "flood"
        risks.append(Risk(kind, rain_dev))

    # 일조는 하한만 본다. 많아서 문제가 되는 경우는 고온장해로 이미 잡힌다.
    light_shortfall = max(0, crop.min_sunshine_hours - weather.sunshine_hours)
    light_dev = (
        min(light_shortfall / crop.min_sunshine_hours, 1) if crop.min_sunshine_hours > 0 else 0
    )
    if light_dev > 0:
        risks.append(Risk("lowLight", light_dev))

    penalty = temp_dev * 50 + rain_dev * 30 + light_dev * 20
    score = _round_half_up(max(0, 100 - penalty))

    return SuitabilityResult(crop.id, score, _to_grade(score), risks)


def _to_grade(score: int) -> Grade:
    if score >= 80:
        return "good"
    if score >= 50:
        return "caution"
    return "unsuitable"


def rank_crops(crops: list[CropProfile], weather: WeatherWindow) -> list[SuitabilityResult]:
    """
    # summary
    여러 후보 작물을 점수 내림차순으로 정렬한다. 동점이면 crop_id 사전순으로 안정화한다.
    TS 는 localeCompare 지만 여기는 코드포인트 비교다 — id 가 ASCII 인 동안은 결과가 같다.

    # params
    crops: 평가할 후보 작물<br>
    weather: 모든 후보에 똑같이 적용할 기상 요약<br>

    # returns
    점수 내림차순 결과. 길이는 crops 와 같다 — 점수가 낮다고 빠지지 않는다.
    crops 가 비면 빈 리스트

    # examples
        rank_crops([tomato, lettuce], weather)
        -> [SuitabilityResult(crop_id='lettuce', score=92, ...), ...]
    """
    results = [score_suitability(crop, weather) for crop in crops]
    return sorted(results, key=lambda r: (-r.score, r.crop_id))
