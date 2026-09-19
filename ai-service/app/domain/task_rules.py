"""필지 하나의 상태로 작업카드 후보를 판정한다. `growthNotes.ts`(buildDeficits)와 같은
철학이다 — LLM을 부르지 않는다. 규칙 기반이라 같은 입력이면 같은 카드가 나오고,
잘못된 카드가 나왔을 때 어느 조건에서 나왔는지 추적할 수 있다.

관수와 시비 둘을 다룬다. 저온·고온 대비 카드는 지역 특보 배너(계획 Step 6)가 만드는
대응 카드로 합친다 — 밭마다 재해 임박을 판정하는 경로를 두 개 두면 카드가 중복되거나
어긋난다.

★ 2026-09-19 — **물 규칙이 `water_need_mm` 을 떠났다.**

    예전    recent_rain_mm < water_need_mm        → 물 주기
    지금    judge_water(기상) × crop_stages(시기)  → 물 주기 / 신경 쓰기 / 주지 마라

  `water_need_mm` 은 원천이 없어 520행 내내 비어 있다(수분장력 추출 0건, '관수량'
  223건은 전부 시설 관수비용표 ㎥/㏊/월). 그 한 칸이 비어서 위 조건이 **영영 거짓**이라
  물 카드가 한 장도 안 나왔다. 필요량을 지어내는 대신 층을 둘로 갈랐다.

    시기   crop_stages.irrigate_needed · stage_hazards   "이 단계에 물이 중요한가"
    사정   app/domain/water_balance.judge_water          "지금·앞으로 마르나"

  ⚠ 둘을 **곱한다.** 기상만 보면 쉬는 밭에도 카드가 가고, 시기만 보면 비 오는 날에도
    물을 주라고 한다.

DB·LLM 의존 없음 — app/service/plot_tasks.py 가 값을 모아 여기 함수로 판정만 시킨다.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.water_balance import (
    WaterBalance,
    dryness_note,
    is_soil_dry,
    judge_water,
    기간말,
)

# 관측 강수 집계 기간(일). ask_context.py 의 RECENT_WEATHER_DAYS 와 같은 값.
#
# ⚠ **판정에 쓰지 않는다.** 판정은 Open-Meteo 물수지(judge_water)가 하고, 이 값은
#   기상청 관측 강수를 **문장의 근거로 덧붙일 때만** 쓴다. 예전에는 이 창으로
#   `water_need_mm` 과 견줬는데, 그 칸이 비어 있어 규칙 자체가 죽어 있었다.
RAIN_WINDOW_DAYS = 7

# 이 단계가 "물이 중요한 때"임을 말해 주는 재해 갈래.
#   가뭄 — 마르면 피해가 나는 시기 (crop_stages 269행 중 108)
#   과습 — 반대로 물이 많으면 피해가 나는 시기 (104)
_DROUGHT = "가뭄"
_WET = "과습"


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

    # ── 시기: crop_stages 에서 온다 ───────────────────────────────
    #: 이 단계에 물주기·배수 작업이 있는가
    irrigate_needed: bool = False
    #: 이 단계에 조심할 재해 갈래 — ('가뭄', '과습', '저온' …)
    stage_hazards: tuple[str, ...] = ()
    #: 이 단계의 농작업 갈래 — ('웃거름', '물주기', '배수' …). 지금은 문장에만 쓴다
    stage_tasks: tuple[str, ...] = ()
    fertilize_needed: bool = False

    # ── 사정: 기상에서 온다 ──────────────────────────────────────
    #: Open-Meteo 물수지. 못 만들었으면 빈 WaterBalance 라 판정이 None 이 된다
    water: WaterBalance = field(default_factory=WaterBalance)
    #: 기상청 관측 최근 강수(mm). 판정이 아니라 **문장의 근거**로만 쓴다
    recent_rain_mm: float | None = None


def _needs_water_attention(inputs: PlotTaskInputs) -> bool:
    """이 단계가 물이 중요한 시기인가.

    ⚠ `irrigate_needed` 와 `가뭄` 은 **서로 다른 신호다.**
      앞은 "이 시기에 물주기·배수 작업이 있다"(520행 중 139),
      뒤는 "이 시기에 가뭄 피해가 잦다"(269행 중 108). 둘 중 하나만 참이어도
      물 카드를 낼 값어치가 있어 `or` 로 묶는다.
    """
    return inputs.irrigate_needed or _DROUGHT in inputs.stage_hazards


def _reason(inputs: PlotTaskInputs, 꼬리: str) -> str:
    """근거 문장. **사실을 먼저 적고 판단은 제목이 한다.**

    ★ 2026-09-19 — 사람 말로 다듬었다.

        예전   "최근 14일 강수에서 증발산을 뺀 값이 -56mm · … 가까운 관측소의 최근
               7일 강수량은 0.0mm 입니다. 수확 단계는 물이 중요한 시기입니다."
        지금   "2주 동안 비가 0.1mm뿐이었어요. 앞으로 3일도 비 소식이 없어요.
               수확 때라 물이 중요해요."

    ⚠ **관측 강수를 늘 적지 않는다.** 앞 문장이 이미 "2주 동안 비가 0.1mm" 라고
      말했는데 "관측소의 7일 강수량은 0.0mm" 를 덧붙이면 같은 말을 두 번 한다.
      **예보와 관측이 어긋날 때만** 적는다 — 그때는 사용자가 "우리 동네는 비 왔는데?"
      하고 의심할 수 있어 출처를 밝히는 것이 낫다.

    ⚠ '말랐습니다' 같은 단정을 쓰지 않는다 — 토양수분·ET0 는 모델값이라 우리 밭의
      흙도 멀칭도 어제 준 물도 모른다(water_balance 파일 머리).
    ⚠ '장마' 를 쓰지 않는다. 7일 예보로 2~4주 현상을 말할 수 없다.
    """
    조각 = [dryness_note(inputs.water)]

    # 예보(모델)와 관측(실측)이 어긋날 때만 관측을 덧붙인다.
    # 5mm 는 "한 번 지나간 소나기" 쯤이다 — 그만큼 벌어지면 사용자도 체감한다.
    예보 = inputs.water.rain_past_mm
    관측 = inputs.recent_rain_mm
    if 관측 is not None and (예보 is None or abs(관측 - 예보) >= 5):
        조각.append(f"가까운 관측소에는 {기간말(RAIN_WINDOW_DAYS)} 동안 {관측:.0f}mm 왔어요.")

    if inputs.stage_name:
        조각.append(f"{inputs.stage_name} 때라 {꼬리}")
    return " ".join(x for x in 조각 if x)


def build_task_candidates(inputs: PlotTaskInputs) -> list[TaskCandidate]:
    """근거를 못 만드는 조건은 후보 자체를 만들지 않는다(스펙 규칙)."""
    candidates: list[TaskCandidate] = []

    # ── 물 ────────────────────────────────────────────────────────
    # judge_water 가 None 이면 근거가 없다는 뜻이다. "괜찮습니다" 라고 말하지 않는다.
    verdict = judge_water(inputs.water)

    if verdict == "give" and _needs_water_attention(inputs):
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko}밭 물 주기",
                reason=_reason(inputs, "물이 중요해요."),
                # 토양수분까지 마른 쪽이면 한 단계 올린다. 뒤집지는 않는다 —
                # 모델값이라 믿을 수 있는 만큼만 쓴다(water_balance.is_soil_dry)
                priority="high" if is_soil_dry(inputs.water) else "mid",
            )
        )
    elif verdict == "watch" and _needs_water_attention(inputs):
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko}밭 물 사정 살피기",
                reason=_reason(inputs, "비가 지나간 뒤 한 번 더 살펴보세요."),
                priority="mid",
            )
        )
    elif verdict == "hold" and _WET in inputs.stage_hazards:
        # ⚠ 과습이 잦은 단계에만 낸다. 큰 비 예보만으로 모든 밭에 카드를 보내면
        #   정작 물이 필요한 밭의 카드가 묻힌다.
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko}밭 물 주지 않기",
                reason=_reason(inputs, "물이 많으면 탈이 나요."),
                priority="mid",
            )
        )

    # ── 시비 ──────────────────────────────────────────────────────
    # 예전 그대로다. 이 규칙은 죽어 있지 않았다 — 2026-09-19 실측으로 카드 1장이
    # 여기서 나왔다(설화고/고추 생육기).
    if inputs.fertilize_needed and inputs.stage_name:
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko} 웃거름 주기",
                reason=f"{inputs.stage_name} 때라 웃거름 줄 시기예요.",
                priority="mid",
            )
        )

    return candidates
