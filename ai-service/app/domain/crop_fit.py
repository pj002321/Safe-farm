"""
---------------------------------------------
[Feature]: 작물 추천 적합도 판정 (실제 마스터 데이터 전용)

[Description]
- `suitability.py` 는 작물마다 이상 온도·강수·일조 "범위"가 있다고 가정하는데,
  실제 DB(`crops`·`crop_variants`)에는 그런 범위 칼럼이 없다 — GDD 기준온도
  (base_temp/upper_temp)와 파종 창(sow_from/sow_to)뿐이다. 그 모듈을 억지로
  재사용하면 있지도 않은 "이상 범위"를 지어내게 되어, 이 기능은 새로 둔다.
  `suitability.py` 자체는 그대로 둔다 — 다른 경로가 쓸 수 있다.
- 판정 3축, 전부 실측/마스터 값에서 나온다. LLM 은 여기 안 들어온다 — 숫자는
  전부 이 함수가 낸다. 자연어 설명(AI 예측)은 이 결과를 근거로 그래프의
  explain 노드가 따로 붙인다.

    1. 파종 창   crop_variants.sow_from/sow_to — 지금이 심어도 되는 창인가
                 (cropOption.ts 의 isSowingSeason 과 같은 판정 — 해넘김 지원)
    2. 생육 속도 crops.base_temp/upper_temp + 최근 날씨 → daily_gdd 평균
                 기준온도를 겨우 넘거나 못 넘으면(<1.0) 생육이 사실상 멈춰 있다
    3. 재해 위험 crop_disaster_rules 의 frost/heat, **stage_name 이 빈 행만** 본다.
                 아직 심지도 않은 시점이라 "몇 단계인지" 자체가 없어, 생육단계별
                 세부 규칙(개화기 30℃ 등)은 판단 근거가 안 된다.

  점수는 100에서 어긋난 만큼 뺀다. 등급 경계는 `suitability.py` 와 맞춘다
  (good>=80, caution>=50, 그 밑은 unsuitable).

[Usage]
```python
tomato = CropCandidate(1, "방울토마토", 8.0, 30.0,
    (SowWindow("04-01", "05-31"),), (HazardRule("frost", "", "ta_min", "lte", 2.0),))
rank_fits([tomato], "04-15", date(2026, 4, 15), recent_weather)
```
---------------------------------------------
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.gdd import daily_gdd

GOOD_MIN = 80
CAUTION_MIN = 50

_HAZARD_LABEL = {"frost": "저온 피해", "heat": "고온 피해"}


@dataclass(frozen=True, slots=True)
class SowWindow:
    sow_from: str | None  # "MM-DD"
    sow_to: str | None


@dataclass(frozen=True, slots=True)
class HazardRule:
    hazard: str  # "frost" | "heat"
    stage_name: str  # "" 이면 작물 전체. 비어 있지 않은 행은 이 판정에서 건너뛴다
    metric: str  # ta_min | ta_max | ta_avg
    op: str  # lte | gte
    threshold_c: float


@dataclass(frozen=True, slots=True)
class DailyWeather:
    date: str
    tmax_c: float
    tmin_c: float
    # 이 날짜(월,일)의 평년값. 관측소를 못 찾거나 평년값이 없으면 None —
    # 점수 계산(score_fit)은 이 필드를 안 본다. explain 노드가 LLM 프롬프트에
    # 얹어 "일시적 수치"가 아니라 "평년 대비"로 설명하게 하는 용도뿐이다.
    tmax_normal_c: float | None = None
    tmin_normal_c: float | None = None


@dataclass(frozen=True, slots=True)
class CropCandidate:
    crop_id: int
    name_ko: str
    base_temp_c: float | None
    upper_temp_c: float | None
    sow_windows: tuple[SowWindow, ...]
    hazard_rules: tuple[HazardRule, ...]


@dataclass(frozen=True, slots=True)
class FitResult:
    crop_id: int
    name_ko: str
    score: int
    grade: str  # good | caution | unsuitable
    in_sowing_window: bool
    risks: tuple[str, ...]  # "cold" | "heat" 부분집합 — SuitabilityCard 의 RiskKind 와 다른 어휘라 그대로 못 씀
    note: str  # 근거 한 줄. LLM 없이도 화면에 바로 쓸 수 있다


def _in_window(today_mmdd: str, window: SowWindow) -> bool:
    """오늘이 이 파종 창 안인가. `cropOption.ts` 의 `isSowingSeason` 과 같은 식이다."""
    if not window.sow_from or not window.sow_to:
        return False
    if window.sow_from <= window.sow_to:
        return window.sow_from <= today_mmdd <= window.sow_to
    return today_mmdd >= window.sow_from or today_mmdd <= window.sow_to


def _days_until(target_mmdd: str, today: date) -> int:
    """오늘부터 target_mmdd 가 다음으로 돌아오는 날까지 며칠. 이미 지났으면 내년 것.

    ⚠ 2/29 같은 날짜가 올해·내년 둘 다 없는 해면 ValueError 가 난다 — 큰 값(365)으로
      갈음한다. "적기 아님" 쪽으로 안전하게 떨어뜨리는 것이 지어낸 날짜보다 낫다.
    """
    m, d = int(target_mmdd[:2]), int(target_mmdd[3:5])
    try:
        target = date(today.year, m, d)
        if target < today:
            target = date(today.year + 1, m, d)
        return (target - today).days
    except ValueError:
        return 365


def _hazard_breach(rules: tuple[HazardRule, ...], days: tuple[DailyWeather, ...]) -> set[str]:
    """작물 전체 규칙(stage_name=="")만 본다. 아직 심지 않아 생육단계가 없다."""
    hits: set[str] = set()
    for rule in rules:
        if rule.stage_name:
            continue
        for day in days:
            value = {
                "ta_min": day.tmin_c,
                "ta_max": day.tmax_c,
                "ta_avg": (day.tmax_c + day.tmin_c) / 2,
            }[rule.metric]
            breached = value <= rule.threshold_c if rule.op == "lte" else value >= rule.threshold_c
            if breached:
                hits.add(rule.hazard)
                break
    return hits


def _avg_daily_gdd(base_temp_c: float | None, upper_temp_c: float | None, days: tuple[DailyWeather, ...]) -> float | None:
    if base_temp_c is None or not days:
        return None
    values = [daily_gdd(d.tmax_c, d.tmin_c, base_temp_c, upper_temp_c) for d in days]
    return sum(values) / len(values)


def score_fit(
    candidate: CropCandidate,
    today_mmdd: str,
    today: date,
    recent: tuple[DailyWeather, ...],
    forecast: tuple[DailyWeather, ...] = (),
) -> FitResult:
    """한 작물의 지금 적합도. `recent`+`forecast` 를 합쳐 재해 임계를 본다."""
    in_window = any(_in_window(today_mmdd, w) for w in candidate.sow_windows)
    score = 100
    notes: list[str] = []

    if not in_window:
        starts = [_days_until(w.sow_from, today) for w in candidate.sow_windows if w.sow_from]
        soon = bool(starts) and min(starts) <= 14
        score -= 40 if soon else 70
        notes.append("곧 파종 적기가 됩니다" if soon else "지금은 파종 적기가 아닙니다")

    hazards = _hazard_breach(candidate.hazard_rules, recent + forecast)
    if hazards:
        score -= 35
        notes.append(" · ".join(_HAZARD_LABEL[h] for h in sorted(hazards)) + " 우려 기온입니다")

    pace = _avg_daily_gdd(candidate.base_temp_c, candidate.upper_temp_c, recent)
    if pace is not None and pace < 1.0:
        score -= 25
        notes.append("최근 기온이 낮아 생육이 더딜 수 있습니다")

    score = max(0, min(100, score))
    grade = "good" if score >= GOOD_MIN else "caution" if score >= CAUTION_MIN else "unsuitable"
    if not notes:
        notes.append("파종 적기이고 특별한 위험 요인이 없습니다")

    return FitResult(
        crop_id=candidate.crop_id,
        name_ko=candidate.name_ko,
        score=score,
        grade=grade,
        in_sowing_window=in_window,
        risks=tuple(sorted(hazards)),
        note=" ".join(notes),
    )


def rank_fits(
    candidates: list[CropCandidate],
    today_mmdd: str,
    today: date,
    recent: tuple[DailyWeather, ...],
    forecast: tuple[DailyWeather, ...] = (),
) -> list[FitResult]:
    """점수 내림차순. 동점이면 입력 순서를 유지한다(`sort` 는 안정 정렬)."""
    return sorted(
        (score_fit(c, today_mmdd, today, recent, forecast) for c in candidates),
        key=lambda r: r.score,
        reverse=True,
    )
