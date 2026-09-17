"""필지 하나의 상태로 작업카드 후보를 판정한다. `growthNotes.ts`(buildDeficits)와 같은
철학이다 — LLM을 부르지 않는다. 규칙 기반이라 같은 입력이면 같은 카드가 나오고,
잘못된 카드가 나왔을 때 어느 조건에서 나왔는지 추적할 수 있다.

지금은 crop_stages 에서 바로 나오는 두 조건(관수·시비)만 다룬다. 저온·고온 대비
카드는 지역 특보 배너(계획 Step 6)가 만드는 대응 카드로 합친다 — 밭마다 재해 임박을
판정하는 경로를 두 개 두면 카드가 중복되거나 어긋난다.

DB·LLM 의존 없음 — app/service/plot_tasks.py 가 값을 모아 여기 함수로 판정만 시킨다.
"""

from __future__ import annotations

from dataclasses import dataclass

# 물 부족 판정에 쓰는 최근 강수 집계 기간(일). ask_context.py 의 RECENT_WEATHER_DAYS 와
# 같은 값 — water_need_mm 이 "그 단계 전체 필요량"인지 "주간 필요량"인지 마스터
# 데이터에 명시가 없어, 기존에 쓰던 7일 창을 그대로 재사용한다.
RAIN_WINDOW_DAYS = 7


@dataclass
class TaskCandidate:
    title: str
    reason: str
    priority: str  # "high" | "mid" | "low"


@dataclass
class PlotTaskInputs:
    """작업카드 판정에 필요한 값 모음. 전부 이미 계산·조회된 값이고, 여기선 비교만 한다."""

    crop_name_ko: str
    stage_name: str | None
    water_need_mm: float | None
    recent_rain_mm: float | None
    fertilize_needed: bool


def build_task_candidates(inputs: PlotTaskInputs) -> list[TaskCandidate]:
    """근거를 못 만드는 조건은 후보 자체를 만들지 않는다(스펙 규칙)."""
    candidates: list[TaskCandidate] = []

    if (
        inputs.water_need_mm is not None
        and inputs.recent_rain_mm is not None
        and inputs.recent_rain_mm < inputs.water_need_mm
    ):
        stage = f"{inputs.stage_name} " if inputs.stage_name else ""
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko}밭 물 주기",
                reason=(
                    f"최근 {RAIN_WINDOW_DAYS}일 강수량이 {inputs.recent_rain_mm:.1f}mm로 "
                    f"{stage}단계 필요량({inputs.water_need_mm:.1f}mm)에 못 미칩니다."
                ),
                priority="high",
            )
        )

    if inputs.fertilize_needed and inputs.stage_name:
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko} 웃거름 주기",
                reason=f"현재 {inputs.stage_name} 단계로 시비 시기입니다.",
                priority="mid",
            )
        )

    return candidates
