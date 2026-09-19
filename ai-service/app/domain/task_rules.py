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

#: 이 기간 합계가 이보다 적거나 같으면 마른 것으로 본다(mm).
#:
#: 화면 쪽 `src/shared/growth/taskAdvice.ts` 의 DRY_MM 과 **같은 값**이다. 출처도
#: 같다 — 농촌진흥청 "가을가뭄" 대책의 관행 기준(`features/report/domain/hazard.ts`
#: 주석). 두 값이 어긋나면 같은 밭을 두고 홈 카드와 재배 상세가 다른 말을 한다.
DRY_MM = 5.0


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
    #: ⚠️ **영영 None 이다.** 원천이 없어 채우지 않기로 했다(마이그레이션
    #:    20260919060000 주석). 남겨 둔 이유는 CSV 계약 헤더 때문이고, 판정에는
    #:    쓰지 않는다. 자료를 찾으면 되살릴 자리다.
    water_need_mm: float | None
    recent_rain_mm: float | None
    #: 이 단계에 물이 중요한가. **필요량이 아니라 시기다.** "지금 마른가"는
    #: recent_rain_mm 이 댄다 — 둘이 함께여야 카드가 나온다.
    irrigate_needed: bool
    fertilize_needed: bool


def build_task_candidates(inputs: PlotTaskInputs) -> list[TaskCandidate]:
    """근거를 못 만드는 조건은 후보 자체를 만들지 않는다(스펙 규칙)."""
    candidates: list[TaskCandidate] = []

    # 물 카드는 **둘이 함께**여야 나온다 — 단계가 "물이 중요한 시기"라고 하고,
    # 기상이 "지금 말랐다"고 할 때.
    #
    # 예전에는 `water_need_mm`(단계별 필요량 mm)과 강수량을 견줬는데, 그 칸이
    # 428행 내내 비어 있어 조건이 **한 번도 참이 되지 못했다** — 할 일 카드가 영영
    # 0건이던 원인이다. 필요량을 지어내는 대신 시기(irrigate_needed)와 기상으로
    # 나눴다(마이그레이션 20260919060000).
    #
    # 강수량을 모르면(관측 없음) 판정하지 않는다. 없는 날을 0mm 로 치면 비 온 날을
    # 가뭄으로 만든다.
    if (
        inputs.irrigate_needed
        and inputs.recent_rain_mm is not None
        and inputs.recent_rain_mm <= DRY_MM
    ):
        stage = f"{inputs.stage_name} " if inputs.stage_name else ""
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko}밭 물 주기",
                reason=(
                    f"최근 {RAIN_WINDOW_DAYS}일 강수량이 {inputs.recent_rain_mm:.1f}mm입니다. "
                    f"{stage}단계는 물이 중요한 시기입니다."
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
