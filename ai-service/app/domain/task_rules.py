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

from app.domain.vegetation_text import crop_is_standing
from app.domain.water_balance import (
    WaterBalance,
    dryness_note,
    is_soil_dry,
    judge_water,
    관측을_밝힐까,
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

#: 관측 강수 {RAIN_WINDOW_DAYS}일 합계가 이보다 적거나 같으면 마른 것으로 본다(mm).
#:
#: 화면 쪽 `src/shared/growth/taskAdvice.ts` 의 DRY_MM 과 **같은 값**이다. 출처도
#: 같다 — 농촌진흥청 "가을가뭄" 대책의 관행 기준(`features/report/domain/hazard.ts`
#: 주석). 두 값이 어긋나면 같은 밭을 두고 홈 카드와 재배 상세가 다른 말을 한다.
#:
#: ★ 2026-09-19 머지 — **평소에는 이 기준이 안 돈다.** 물수지(judge_water)가
#:   ET0 와 예보까지 보고 판정하기 때문이다. 이 값은 **Open-Meteo 를 못 받았을 때의
#:   안전망**으로 남는다. 관측소 강수는 DB 에 이미 있어서, 외부 API 가 죽어도
#:   물 카드가 통째로 사라지지는 않는다(_fallback_verdict).
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

    # ⚠ `water_need_mm` 은 이 자료형에 없다. **DB 칸과 CSV 계약은 그대로 둔다** —
    #   crop_stages 의 열도, crop-data 쪽 헤더도 건드리지 않았다(마이그레이션
    #   20260919060000 주석). 다만 영영 비는 칸이라 판정에 넘길 이유가 없어,
    #   여기서는 받지 않는다. 자료를 찾으면 되살릴 자리는 DB 쪽에 그대로 있다.

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

    # ── 수확: GDD 가 '때'를, 위성이 '아직 있나'를 말한다 ──────────
    #: 씨뿌림→수확 목표 GDD 를 넘었는가. 목표를 모르면 False
    gdd_target_passed: bool = False
    #: 심는 법('씨뿌림'·'아주심기' …). 비면 다년생을 의심한다 — harvest_clears_field
    sow_method: str | None = None
    #: 최근 위성 NDVI. 없으면 None — 수확 판정에서 빠진다(없으면 거짓)
    ndvi: float | None = None


# ─────────────────────────────────────────────────────────────────────
# 거둬도 밭에 **남는** 작물.
#
# ⚠ 가르는 기준이 '1년생/다년생' 이 아니다. 위성이 실제로 보는 것은
#   **"거두면 밭에서 사라지나"** 다.
#
#     벼 · 배추 · 참깨 · 마늘 · 생강 · 연근   거두면 밭이 빈다 → NDVI 가 떨어진다 ✅
#     사과 · 부추 · 아스파라거스 · 두릅        거둬도 남는다   → NDVI 가 그대로 ⚠
#
#   마늘은 다년생이냐가 아니라 **캐면 없어지니까** 괜찮고, 부추는 1년생 취급을
#   받아도 **베어도 뿌리가 남으니까** 안 된다. 그래서 목록 이름이 '과수' 가 아니다.
#
# ⚠ 앞 18은 crop-data 의 과수 목록(pipeline/parts.py)과 같다. 두 벌이 된 것을
#   알고 둔다 — 저쪽은 GDD 기점을 가르는 용도고 여기는 화면 조언을 막는 용도라,
#   한쪽이 바뀌어도 다른 쪽이 따라야 할 이유가 없다. 뒤 셋이 그 증거다.
_STAYS_AFTER_HARVEST = frozenset(
    {
        # 과수 — 열매를 따도 잎이 늦가을까지 남는다
        "감귤",
        "단감",
        "매실",
        "무화과",
        "배",
        "복숭아",
        "블루베리",
        "사과",
        "살구",
        "유자",
        "자두",
        "참다래",
        "체리",
        "포도",
        "플럼코트",
        "한라봉(부지화)",
        "애기사과",
        "꽃사과나무",
        # 나무는 아닌데 베어도 뿌리가 남아 다시 올라오는 것들
        "부추",
        "아스파라거스",
        "두릅",
    }
)

#: 해마다 새로 심는다는 표시. `crop_variants.sow_method` 에 들어 있는 말들이다.
#: 위 목록에 없는 다년생(고사리·마)을 줍는 **2순위 그물**이다.
_PLANTING_METHODS = frozenset({"씨뿌림", "파종", "아주심기", "모기르기", "모 기르기", "육묘"})


def harvest_clears_field(crop_name_ko: str, sow_method: str | None) -> bool:
    """거두면 밭이 비는 작물인가. **모르면 거짓이다.**

    두 층으로 거른다 —
        1순위  이름이 목록에 있으면 남는 작물이다 (확실하다)
        2순위  심는 법이 비었으면 다년생을 의심한다 (고사리·마)

    ★ 왜 2순위가 먹히나 (2026-09-19 실측)
          과수 28품종   sow_method (빔) 27 · 인공수분 1   ← 심는 말이 0개
      나무는 한 번 심고 두는 것이라 "해마다 어떻게 심나" 라는 칸이 빈다.

    ⚠ 거짓으로 떨어지면 수확 카드가 안 나갈 뿐이다. 반대로 틀리면 포도밭에
      "수확하세요" 가 간다. 이 방향으로 틀리는 편을 골랐다 — 그래서 1년생
      2품종(담근먹이 옥수수·완두)도 심는 법이 비어 같이 빠진다. 침묵이지 오보가 아니다.
    """
    if crop_name_ko in _STAYS_AFTER_HARVEST:
        return False
    return sow_method in _PLANTING_METHODS


def _needs_water_attention(inputs: PlotTaskInputs) -> bool:
    """이 단계가 물이 중요한 시기인가.

    ⚠ `irrigate_needed` 와 `가뭄` 은 **서로 다른 신호다.**
      앞은 "이 시기에 물주기·배수 작업이 있다"(520행 중 139),
      뒤는 "이 시기에 가뭄 피해가 잦다"(269행 중 108). 둘 중 하나만 참이어도
      물 카드를 낼 값어치가 있어 `or` 로 묶는다.
    """
    return inputs.irrigate_needed or _DROUGHT in inputs.stage_hazards


def _fallback_verdict(inputs: PlotTaskInputs) -> str | None:
    """물수지를 못 만들었을 때의 **안전망**. 관측 강수만으로 '마름'을 본다.

    ★ 2026-09-19 머지 — development 의 `DRY_MM` 규칙을 여기 남겼다.

      평소에는 `judge_water` 가 ET0 와 3·7일 예보까지 보고 판정하므로 이 함수는
      돌지 않는다. 도는 때는 **Open-Meteo 를 못 받았을 때**다(외부 API 장애·좌표
      이상). 그때 관측소 강수는 DB 에 이미 있으므로, 물 카드가 통째로 사라지는
      대신 얇은 근거로라도 남는다.

    ⚠ 그래서 등급을 올리지 않는다(`give` 를 내되 호출 쪽이 mid 로 매긴다).
      ET0 도 예보도 못 본 판정이라 물수지로 낸 것과 같은 무게로 두면 안 된다.
    ⚠ `hold`·`watch` 는 만들지 않는다. 둘 다 **예보**가 있어야 할 수 있는 말이고,
      여기는 지난 비만 안다. 모르는 것을 아는 척하지 않는다.
    """
    if inputs.recent_rain_mm is None:
        # 관측이 없으면 판정하지 않는다. 없는 날을 0mm 로 치면 비 온 날을 가뭄으로 만든다
        return None
    return "give" if inputs.recent_rain_mm <= DRY_MM else None


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
    # ⚠ 기준은 water_balance 한 곳에 있다 — 리포트 프롬프트도 같은 함수를 쓴다.
    관측 = inputs.recent_rain_mm
    if 관측을_밝힐까(inputs.water.rain_past_mm, 관측):
        조각.append(f"가까운 관측소에는 {기간말(RAIN_WINDOW_DAYS)} 동안 {관측:.0f}mm 왔어요.")

    if inputs.stage_name:
        조각.append(f"{inputs.stage_name} 때라 {꼬리}")
    return " ".join(x for x in 조각 if x)


def build_task_candidates(inputs: PlotTaskInputs) -> list[TaskCandidate]:
    """근거를 못 만드는 조건은 후보 자체를 만들지 않는다(스펙 규칙)."""
    candidates: list[TaskCandidate] = []

    # ── 수확 ──────────────────────────────────────────────────────
    # ★ 2026-09-19 — **GDD 가 '때'를 말하고 위성이 '아직 있나'를 말한다.**
    #
    #   하나만으로는 못 낸다. GDD 만 보면 이미 거둔 밭에도 카드가 가고,
    #   위성만 보면 한창 자라는 밭더러 우거졌으니 거두라는 말이 된다.
    #
    #       목표 넘음 + 아직 푸름  →  다 익었는데 밭에 있다   ← 여기만 낸다
    #       목표 넘음 + 안 푸름   →  이미 거뒀다             → 침묵
    #       목표 아직  + 푸름     →  자라는 중               → 침묵
    if (
        inputs.gdd_target_passed
        and harvest_clears_field(inputs.crop_name_ko, inputs.sow_method)
        and crop_is_standing(inputs.ndvi)
    ):
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko} 거둘 때 살펴보기",
                # ⚠ "거두세요" 라고 단정하지 않는다. 위성은 잎을 볼 뿐 그게 우리
                #   작물인지 모른다 — 추수 뒤 호밀이나 잡초도 똑같이 우거져 보인다.
                #   "나가서 보세요" 까지면 틀려도 헛걸음 한 번으로 끝난다.
                reason=(
                    "심고 나서 쌓인 온도가 다 자라는 데 필요한 만큼을 넘었어요. "
                    "위성으로 봐도 밭이 아직 푸른 걸 보면 거두기 전이에요. "
                    "밭에 나가 여문 정도를 살펴보세요."
                ),
                priority="high",
            )
        )

    # ── 물 ────────────────────────────────────────────────────────
    # judge_water 가 None 이면 근거가 없다는 뜻이다. "괜찮습니다" 라고 말하지 않는다.
    verdict = judge_water(inputs.water) or _fallback_verdict(inputs)

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
