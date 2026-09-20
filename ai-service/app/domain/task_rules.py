"""필지 하나의 상태로 작업카드 후보를 판정한다. `growthNotes.ts`(buildDeficits)와 같은
철학이다 — LLM을 부르지 않는다. 규칙 기반이라 같은 입력이면 같은 카드가 나오고,
잘못된 카드가 나왔을 때 어느 조건에서 나왔는지 추적할 수 있다.

다루는 갈래 — 재해 · 수확 · 물 · 병해충 · 시비 · 농사일. **이 순서로 낸다.**
홈이 위에서부터 읽히므로, 태풍이 오는 날 물 주기가 맨 위에 있으면 안 된다.

⚠ **재해를 여기서 판정하지 않는다.** 기온·강수를 보고 "태풍이 올 것 같다" 고 하지
  않고, 기상청 특보 목록(`warnings`)을 받아 **할 일과 안전 당부로 바꾸기만** 한다.
  밭마다 재해 임박을 판정하는 경로를 두 개 두면 카드가 중복되거나 어긋난다 —
  판정은 기상청 한 곳이고 화면의 특보 배너도 같은 곳을 본다.

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

import re
from dataclasses import dataclass, field

from app.domain.korean import 조사
from app.domain.vegetation_text import NDMI_STEP, Vegetation, crop_is_standing
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
# 기온 한계 카드가 보는 갈래(crop_stages 269행 중 저온 118 · 고온 21)
_COLD = "저온"
_HOT = "고온"

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
    #: 이 단계의 농작업 갈래 — ('웃거름', '물주기', '배수' …)
    stage_tasks: tuple[str, ...] = ()
    #: 이맘때 이 작물에 자주 나오는 병해충 이름(app/service/pest_notes). 없으면 빈 튜플
    pest_names: tuple[str, ...] = ()
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
    #: 위성이 본 것. **비어 있는 것이 기본값이다** — `water` 와 같은 결이다.
    #:
    #: ⚠ 부르는 쪽이 **너무 오래된 관측은 빈 값으로 지워서** 넘긴다
    #:   (plot_tasks.SATELLITE_FRESH_DAYS). 여기서 날짜를 세지 않는 것은 domain 이
    #:   시계를 읽지 않기 때문이다.
    vegetation: Vegetation = field(default_factory=Vegetation)

    # ── 재해 한계: 작물이 몇 도부터 상하나 ──────────────────────
    #: 아침 최저가 이 아래면 언다·상한다(crop_disaster_rules). 모르면 None
    frost_limit_c: float | None = None
    #: 낮 최고가 이 위면 상한다. 모르면 None
    heat_limit_c: float | None = None
    #: 내일 예보 최저·최고(도). 못 받았으면 None — 판정에서 빠진다
    tomorrow_temp_min: float | None = None
    tomorrow_temp_max: float | None = None

    # ── 재해: 기상청 특보를 **그대로 받는다** ────────────────────
    #: 지금 이 밭에 걸려 있는 특보 종류 — ('호우', '강풍'). 없으면 빈 튜플.
    #:
    #: ⚠ **여기서 재해를 판정하지 않는다.** 기온·강수를 보고 "태풍이 올 것 같다"
    #:   고 하지 않는다 — 판정은 기상청 한 곳이고, 우리는 그 목록을 받아 할 일로
    #:   바꾸기만 한다. 판정 경로를 두 개 두면 어긋난다(파일 머리).
    warnings: tuple[str, ...] = ()


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

    ★ 왜 2순위가 먹히나
      나무는 한 번 심고 두는 것이라 "해마다 어떻게 심나" 라는 칸에 심는 말이 안 온다.

          2026-09-19 실측   과수 28품종  (빔) 27 · 인공수분 1
          2026-09-20 이후   과수 27품종  발아 23 · 개화 4      ← 빈 칸이 채워졌다

      ⚠ **판정은 그대로 맞다.** 과수를 살리면서 `sow_method` 에 기점 낱말을 싣게
        됐는데(`교안_과수를_살린다.md`), `발아`·`개화` 는 `_PLANTING_METHODS` 에
        없으므로 여전히 거짓 — "거둬도 밭에 남는다" 로 판정된다.
      ⚠ 그러니 **`_PLANTING_METHODS` 에 기점 낱말을 더하지 말 것.** 더하는 순간
        사과밭이 "거두면 비는 밭" 이 되어 수확 카드가 잘못 나간다.

    ⚠ 거짓으로 떨어지면 수확 카드가 안 나갈 뿐이다. 반대로 틀리면 포도밭에
      "수확하세요" 가 간다. 이 방향으로 틀리는 편을 골랐다 — 그래서 1년생
      2품종(담근먹이 옥수수·완두)도 심는 법이 비어 같이 빠진다. 침묵이지 오보가 아니다.
    """
    if crop_name_ko in _STAYS_AFTER_HARVEST:
        return False
    return sow_method in _PLANTING_METHODS


#: 과수인지 가르는 `sow_method` 값. `service/plot_growth.FRUIT_METHODS` 와 같다.
#:
#: ⚠ **domain 은 DB 를 안 보므로 여기에도 적는다.** 두 벌이지만 값이 둘뿐이고
#:   `_PLANTING_METHODS` 와 나란히 있어야 "심는 말 / 기점 낱말" 의 대비가 보인다.
_FRUIT_METHODS = frozenset({"발아", "개화"})

#: 단계 이름이 이것을 품으면 **거둘 때**다.
#:
#: ⚠ `수확보`(체리의 '착과수확보')는 수확이 아니다 — `cropping.수확아님` 과 같은 함정이라
#:   여기서도 뺀다.
_수확단계말 = ("수확", "성숙", "착색")
_수확아님 = ("수확보", "수확확보", "수확예정")


def 과수수확중(inputs: PlotTaskInputs) -> bool:
    """과수가 지금 **거둘 단계**인가.

    ⚠ 한해살이의 수확 판정(`gdd_target_passed` + 밭이 비나 + 위성)을 과수에 쓸 수
      없어서 따로 둔다 — 위 ★ 참고. 여기서는 **단계 이름 하나**만 본다.
    """
    if (inputs.sow_method or "").strip() not in _FRUIT_METHODS:
        return False
    # ⚠ **괄호 안 설명을 떼고 본다.** 단계 이름에 원본의 풀이가 붙어 오는 작물이 있다 —
    #   참다래 `과실 2차 비대기 (재배환경에 따라 30~40% 비대성숙)` 의 **'비대성숙'** 이
    #   `성숙` 에 걸려 비대기인데 수확 카드가 떴다(2026-09-21 실측).
    #   괄호를 떼는 것은 crop-data 쪽 숙제다(`이슈/과수_원본자료_공백_다섯.md` ③).
    #   여기서는 **읽는 쪽이 방어**한다 — 마스터가 고쳐져도 이 줄은 해롭지 않다.
    이름 = re.sub(r"\s*[(（].*", "", inputs.stage_name or "").strip()
    if any(w in 이름 for w in _수확아님):
        return False
    return any(w in 이름 for w in _수확단계말)


# ─────────────────────────────────────────────────────────────────────
# 농작업 갈래 → 카드 한 장.
#
# `crop_stages.stage_tasks` 는 520행 중 260행이 차 있는데(2026-09-19 실측)
# **한 번도 읽히지 않았다.** 물 카드 하나만 나가던 이유가 여기 있다.
#
#     웃거름 85 · 김매기 78 · 배수 76 · 방제 68 · 물주기 32 · 솎기 30
#     수확후 20 · 밑거름 20 · 순지르기 18 · 피복 13 · 지주 13
#
# ⚠ **웃거름·물주기는 뺀다.** 이미 시비 카드와 물 카드가 판정한다. 여기서 또
#   내면 같은 밭에 같은 말이 두 장 간다.
# ⚠ **방제도 뺀다.** 아래 병해충 카드가 이름까지 달아 대신 낸다.
_작업문구: dict[str, tuple[str, str]] = {
    "배수": ("물길 터 주기", "고랑에 물이 고이지 않게 터 주세요."),
    "김매기": ("김매기", "풀이 자라면 양분과 볕을 빼앗깁니다."),
    "솎기": ("솎아 주기", "빽빽하면 서로 자리를 뺏어 굵게 자라지 못합니다."),
    "순지르기": ("순 지르기", "곁순을 따 주면 열매 쪽으로 힘이 갑니다."),
    "지주": ("지주 세우기", "줄기가 쓰러지지 않게 미리 받쳐 주세요."),
    "피복": ("덮어 주기", "비닐이나 짚으로 덮으면 흙이 마르고 굳는 것을 막습니다."),
    "밑거름": ("밑거름 넣기", "심기 전에 거름을 넣어 둘 때입니다."),
    "수확후": ("거둔 뒤 정리", "남은 줄기와 뿌리를 걷어 내면 이듬해 병이 줄어듭니다."),
}

#: **과수일 때 갈아 끼우는 문구.** 없는 갈래는 위 표를 그대로 쓴다.
#:
#: ★ 2026-09-21 — crop-data 의 갈래는 **한해살이 기준으로 묶여 있다.**
#:   과수에서 흔한 일이 엉뚱한 이름으로 나왔다 (실측: 전정 25건 · 봉지 6건 · 유인 11건).
#:
#:       원본 '전정'   → 갈래 `순지르기`("순지르기|적심|정지|전정|눈솎기|곁순")
#:                      → 화면 "사과 순 지르기"   ⚠ 순 지르기는 곁순 따기다. 가지치기가 아니다
#:       원본 '봉지'   → 갈래 `솎기`("…|꽃솎|봉지|열매양")
#:                      → 화면 "사과 솎아 주기"   ⚠ 뜻이 아예 다르다
#:       원본 '유인'   → 갈래 `지주`("받침대|지주|네트|유인")
#:                      → 화면 "사과 지주 세우기" ⚠ 나무는 세우는 게 아니라 가지를 눕힌다
#:
#: ⚠ **갈래를 새로 파지 않는다.** crop-data 에 갈래를 더하면 CSV 계약이 바뀌고
#:   재빌드·재시딩·재임베딩이 따라온다. 갈래는 그대로 두고 **읽는 쪽에서 말만** 고른다.
#:
#: ⚠ 한 갈래에 둘이 섞여 있다(`전정`+`적심` · `봉지`+`솎기`). 과수에서는 앞쪽이
#:   압도적이라 그쪽으로 말한다 — **둘을 가를 자료가 없다.** 가르려면 crop-data 가
#:   갈래를 쪼개야 한다(`이슈/과수_원본자료_공백_다섯.md` 에 남긴다).
_작업문구_과수: dict[str, tuple[str, str]] = {
    "순지르기": ("가지 치기", "묵은 가지와 웃자란 가지를 쳐 주면 볕과 바람이 듭니다."),
    "솎기": (
        "열매 솎기·봉지 씌우기",
        "너무 많이 달리면 알이 잘아집니다. 봉지를 씌울 때이기도 합니다.",
    ),
    "지주": ("가지 유인·받치기", "열매 무게로 가지가 찢어지지 않게 묶거나 받쳐 주세요."),
    "수확후": ("거둔 뒤 정리", "떨어진 열매와 잎을 걷어 내면 이듬해 병이 줄어듭니다."),
    "피복": ("덮어 주기", "뿌리 언 피해를 막게 밑동을 덮어 주세요."),
}

#: 병해충 카드가 대신 내는 갈래
_방제 = "방제"


def _work_candidates(inputs: PlotTaskInputs) -> list[TaskCandidate]:
    """이 단계에 하는 농작업을 카드로. 표에 없는 갈래는 조용히 넘어간다.

    ⚠ 등급이 `low` 다. **"지금 해야 한다" 가 아니라 "이 시기에 하는 일" 이다** —
      물이나 수확처럼 때를 놓치면 못 돌이키는 것과 같은 무게로 두면, 정작 급한
      카드가 묻힌다.
    """
    머리 = f"{inputs.stage_name} 때 하는 일이에요. " if inputs.stage_name else ""
    # 과수는 같은 갈래라도 하는 일이 다르다 — `_작업문구_과수` 의 ★ 참고
    과수 = (inputs.sow_method or "").strip() in _FRUIT_METHODS
    나온것: list[TaskCandidate] = []
    for 갈래 in inputs.stage_tasks:
        문구 = (_작업문구_과수.get(갈래) if 과수 else None) or _작업문구.get(갈래)
        if 문구 is None:
            continue
        제목, 까닭 = 문구
        나온것.append(TaskCandidate(f"{inputs.crop_name_ko} {제목}", f"{머리}{까닭}", "low"))
    return 나온것


def _pest_candidate(inputs: PlotTaskInputs) -> TaskCandidate | None:
    """이맘때 병해충. **여러 장으로 쪼개지 않는다.**

    고추 한 작물에 9월 중순 자료가 여섯 줄이다(실측). 한 장에 묶지 않으면
    물 카드가 그 아래로 밀린다.

    ⚠ **"지금 발생 중" 이라고 하지 않는다.** 2023~2026 발생정보의 이맘때 자료라
      올해 돌고 있다는 뜻이 아니다. 단정하면 거짓이 되고, 한 번 틀린 경보를 보면
      맞는 경보도 무시하게 된다.
    ⚠ 약을 지정하지 않는다. 진단도 하지 않는다 — 살펴보라는 데까지다.
    """
    방제철 = _방제 in inputs.stage_tasks
    if not inputs.pest_names and not 방제철:
        return None

    조각 = []
    if inputs.pest_names:
        이름 = "·".join(inputs.pest_names)
        # "바이러스이 자주 나와요" 가 나가지 않게 받침을 본다
        조각.append(f"이맘때 {inputs.crop_name_ko}에 {이름}{조사(이름, '이', '가')} 자주 나와요.")
    if 방제철:
        조각.append("이 시기가 방제 때이기도 해요.")
    조각.append("잎 뒷면과 줄기를 살펴보세요.")

    return TaskCandidate(
        title=f"{inputs.crop_name_ko} 병해충 살펴보기",
        reason=" ".join(조각),
        priority="mid",
    )


# ─────────────────────────────────────────────────────────────────────
# 특보 → 대비와 **안전**.
#
# ⚠ 기상청이 판정하고 우리는 받아 적는다. 여기서 재해를 다시 판정하지 않는다.
#
# ⚠ **바다 특보는 거른다.** 지금 떠 있는 것이 '풍랑' 인데 밭일과 무관하다.
#   상관없는 카드가 한 번 뜨면 다음에 맞는 경보가 떠도 안 읽는다.
_바다특보 = frozenset({"풍랑", "폭풍해일", "해일", "지진해일"})

#: 특보 종류 → (미리 할 일, 안전 당부)
#:
#: ★ 안전 당부가 이 카드의 **본론**이다. 대비 작업은 거들 뿐이다 —
#:   태풍에 물꼬를 보러 나갔다가, 폭염에 참고 일하다가 해마다 사람이 죽는다.
#:   "미리 해 두고, 특보 중에는 나가지 마세요" 가 우리가 할 수 있는 말이다.
_특보대비: dict[str, tuple[str, str]] = {
    "태풍": (
        "물길을 미리 터 두고 비닐과 지주를 단단히 묶어 두세요.",
        "특보 중에는 밭에 나가지 마세요. 물꼬를 보러 갔다가 휩쓸리는 사고가 해마다 납니다.",
    ),
    "호우": (
        "고랑과 배수로가 막히지 않았는지 비 오기 전에 봐 두세요.",
        "물이 불어난 뒤에는 나가지 마세요. 논둑은 보기보다 빨리 무너집니다.",
    ),
    "강풍": (
        "지주와 비닐을 단단히 고정하고 날아갈 것을 치워 두세요.",
        "바람이 잦아든 뒤에 나가세요. 하우스와 지주 곁은 특히 위험합니다.",
    ),
    # ⚠ 폭염이 가장 길다. 다른 특보는 작물이 상하지만 폭염은 **사람이 쓰러진다** —
    #   온열질환 사망은 해마다 논밭에서 가장 많이 난다. 짧게 적을 자리가 아니다.
    "폭염": (
        "물은 해 뜨기 전이나 해 진 뒤에 주세요. 한낮에 주면 금세 마르고 잎이 뎁니다. "
        "하우스는 측창을 열어 두고, 여린 잎에는 차광망이나 짚을 덮어 주세요.",
        "한낮 11시부터 5시까지는 밭일을 접으세요. 그늘에서 자주 쉬고 물은 미리 드세요 — "
        "목이 마른 뒤에는 이미 늦습니다. 어지럽거나 메스껍거나 땀이 안 나면 "
        "참지 말고 그 자리에서 그만두세요. 혼자 나가실 때는 집에 어느 밭에 간다고 "
        "일러 두고 가세요.",
    ),
    "한파": (
        "비닐이나 짚으로 덮고 호스에 남은 물을 빼 두세요.",
        "이른 아침 혼자 나가지 마세요. 미끄러지면 일어나기 어렵습니다.",
    ),
    "대설": (
        "하우스 지붕의 눈을 미리 쓸어 두세요.",
        "눈이 쌓인 하우스 안에는 들어가지 마세요. 주저앉을 수 있습니다.",
    ),
    "건조": (
        "마른 줄기와 부산물을 치워 두세요.",
        "밭두렁을 태우지 마세요. 해마다 이맘때 산불이 그렇게 납니다.",
    ),
}

#: 표에 없는 특보에도 안전은 말한다. 무엇을 대비할지는 모르지만 말리는 건 할 수 있다
_기본안전 = "특보가 풀린 뒤에 나가세요. 무리하지 마세요."

#: **사람이 다치는 순서**다. 작물 피해가 아니라 인명 기준이다 —
#: 폭염은 논밭에서 해마다 가장 많이 죽고, 물과 눈이 그다음이다.
#: 특보가 겹쳤을 때 어느 안전 문구를 남길지 이 순서가 정한다.
_위험순서 = ("폭염", "태풍", "호우", "대설", "한파", "강풍", "건조")


def _temp_candidate(inputs: PlotTaskInputs) -> TaskCandidate | None:
    """내일 기온이 이 작물의 한계를 넘나. **시기 × 한계 × 사정**이다.

    ★ 2026-09-19 — `crop_disaster_rules` 93행이 작물 상세 화면에서만 읽히고
      홈·리포트·카드 어디에도 안 닿고 있었다. 물 카드와 같은 구조로 꺼냈다 —
      `stage_hazards` 가 "이 시기에 저온 피해가 잦다" 를 말하고, 이 표가
      "몇 도부터" 를 준다.

    ⚠ **시기를 곱한다.** 한계만 보면 한겨울 빈 밭에도 경고가 간다. 단계표가
      '저온'·'고온' 을 걱정하는 시기여야 낸다 — 물 카드가 '가뭄'·'과습' 을
      보는 것과 같다.

    ⚠ 특보 카드와 겹치지 않는다. 저쪽은 **기상청이 낸 특보**를 옮기는 것이고
      여기는 **이 작물의 한계**를 본다. 특보가 없어도 이 밭에는 추울 수 있다.
    """
    최저, 최고 = inputs.tomorrow_temp_min, inputs.tomorrow_temp_max

    if (
        _COLD in inputs.stage_hazards
        and inputs.frost_limit_c is not None
        and 최저 is not None
        and 최저 <= inputs.frost_limit_c
    ):
        return TaskCandidate(
            title=f"{inputs.crop_name_ko} 추위 대비하기",
            reason=(
                f"내일 아침 최저가 {최저:.0f}도예요. "
                f"{inputs.crop_name_ko}{조사(inputs.crop_name_ko, '은', '는')} "
                f"{inputs.frost_limit_c:.0f}도부터 상합니다. "
                "덮개나 짚을 미리 씌워 두세요."
            ),
            priority="high",
        )

    if (
        _HOT in inputs.stage_hazards
        and inputs.heat_limit_c is not None
        and 최고 is not None
        and 최고 >= inputs.heat_limit_c
    ):
        return TaskCandidate(
            title=f"{inputs.crop_name_ko} 더위 대비하기",
            reason=(
                f"내일 낮 최고가 {최고:.0f}도예요. "
                f"{inputs.crop_name_ko}{조사(inputs.crop_name_ko, '은', '는')} "
                f"{inputs.heat_limit_c:.0f}도부터 상합니다. "
                "차광망을 덮고 물은 해 뜨기 전이나 해 진 뒤에 주세요."
            ),
            priority="high",
        )

    return None


def _hazard_candidate(inputs: PlotTaskInputs) -> TaskCandidate | None:
    """특보가 떴을 때 **미리 할 일과 안전 당부** 한 장.

    ⚠ 여러 특보가 겹쳐도 한 장이다. 태풍이 오는 날 카드 네 장을 주면 아무것도
      안 읽는다.
    """
    쓸것 = tuple(w for w in inputs.warnings if w not in _바다특보)
    if not 쓸것:
        return None

    할일 = [_특보대비[w][0] for w in 쓸것 if w in _특보대비]

    # ⚠ 안전 문구는 **가장 위험한 쪽 하나**를 고른다. 겹친 특보마다 붙이면 글이
    #   길어져 아무것도 안 읽히고, 앞의 것을 그냥 쓰면 태풍+폭염 때 열사병 경고가
    #   조용히 빠진다 — 특보가 들어온 순서는 위험과 아무 상관이 없다.
    걸린것 = [w for w in _위험순서 if w in 쓸것]
    안전 = _특보대비[걸린것[0]][1] if 걸린것 else _기본안전

    이름 = "·".join(쓸것)
    조각 = [f"{이름} 특보가 내려졌어요."]
    조각.extend(할일)
    # ⚠ 안전이 맨 뒤다 — 마지막 줄이 가장 오래 남는다
    조각.append(f"⚠ {안전}")

    return TaskCandidate(
        title=f"{이름} 특보 — 미리 해 두고 몸조심하세요",
        reason=" ".join(조각),
        priority="high",
    )


def _watering_already_done(inputs: PlotTaskInputs) -> bool:
    """이미 물을 주고 계신 밭인가. 위성이 그렇다고 말할 때만 참이다.

    ★ 2026-09-19 — **물수지는 하늘에서 온 물만 안다.** 호스로 준 물도, 멀칭도,
      어제 댄 물도 모른다. 부지런한 분일수록 헛카드를 더 받는 꼴이라, 잎을 직접
      본 위성으로 막는다.

    ⚠ **틀리는 방향이 다른 규칙들과 반대다.** 여태 만든 것은 "모르면 침묵" 이지만
      여기는 **"모르면 카드를 낸다"** 가 안전하다 — 위성이 없다고 물 카드를 막으면
      진짜 가문 밭이 조용해진다. 그래서 세 가지가 **모두** 참일 때만 막는다.

          ① 잎이 우거져 있다            NDVI ≥ 0.40. 맨땅이면 볼 잎이 없다
          ② 물기가 줄지 않았다          NDMI 가 비슷하거나 늘었다
          ③ 견줄 앞 관측이 있다         하나뿐이면 추세를 모른다

    ⚠ 관측이 오래됐으면 부르는 쪽이 빈 값으로 지워 넘긴다. 열흘 전 잎으로 오늘
      물 카드를 막으면 그 사이 마른 밭이 조용해진다.
    """
    v = inputs.vegetation
    if not crop_is_standing(v.ndvi):
        return False
    if v.ndmi_now is None or v.ndmi_before is None:
        return False
    # 줄지 않았다 = 준 폭이 임계보다 작다. 늘어난 것도 여기 든다
    return v.ndmi_now - v.ndmi_before > -NDMI_STEP


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

    # ── 재해 ──────────────────────────────────────────────────────
    # **맨 앞이다.** 태풍이 오는 날 물 주기 카드가 위에 있으면 안 된다.
    if (재해 := _hazard_candidate(inputs)) is not None:
        candidates.append(재해)

    # 기온 한계는 특보 바로 다음이다. 특보가 없어도 이 밭에는 추울 수 있다
    if (기온 := _temp_candidate(inputs)) is not None:
        candidates.append(기온)

    # ── 수확 ──────────────────────────────────────────────────────
    # ★ 2026-09-19 — **GDD 가 '때'를 말하고 위성이 '아직 있나'를 말한다.**
    #
    #   하나만으로는 못 낸다. GDD 만 보면 이미 거둔 밭에도 카드가 가고,
    #   위성만 보면 한창 자라는 밭더러 우거졌으니 거두라는 말이 된다.
    #
    #       목표 넘음 + 아직 푸름  →  다 익었는데 밭에 있다   ← 여기만 낸다
    #       목표 넘음 + 안 푸름   →  이미 거뒀다             → 침묵
    #       목표 아직  + 푸름     →  자라는 중               → 침묵
    #   ★ 2026-09-21 — **과수는 다른 길로 낸다.** 위 셋을 그대로 대면 영영 안 나온다:
    #     `harvest_clears_field` 가 거짓이고(나무는 거둬도 밭에 남는다),
    #     `crop_is_standing` 은 늘 참이다(잎이 그대로라 거둔 뒤를 못 가른다).
    #     그 둘은 **한해살이용 자**다 — 밭이 비는지로 수확을 재는 방식이라
    #     과수에는 쓸 수가 없다.
    #
    #     대신 **단계 이름**을 본다. 과수 단계표는 기점~수확까지만 담고(교안 §3-2)
    #     마지막이 수확류다 — 지금 그 단계에 있다는 것이 곧 "딸 때" 다.
    #
    #     ⚠ `gdd_target_passed` 를 안 쓴다. 감귤은 수확기가 11-05~12-25 로 7주인데
    #       목표를 11월 10일에 다 채운다. 그걸로 내면 45일 내내 같은 카드가 뜬다
    #       (`이슈/과수_GDD모델의_한계_셋.md` ①).
    if 과수수확중(inputs):
        candidates.append(
            TaskCandidate(
                title=f"{inputs.crop_name_ko} 거둘 때 살펴보기",
                reason=(
                    f"{inputs.stage_name} 때예요. 나무마다 익는 속도가 달라 "
                    "한 번에 다 거두지 않습니다. 밭에 나가 여문 것부터 살펴보세요."
                ),
                priority="high",
            )
        )
    elif (
        inputs.gdd_target_passed
        and harvest_clears_field(inputs.crop_name_ko, inputs.sow_method)
        and crop_is_standing(inputs.vegetation.ndvi)
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

    # ⚠ **`hold`(주지 마라)는 막지 않는다.** 저건 "주지 말라" 는 말이라, 이미
    #   주고 계셔도 그대로 나가야 한다.
    if verdict in ("give", "watch") and _watering_already_done(inputs):
        verdict = "skip"

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

    # ── 병해충 · 농작업 ───────────────────────────────────────────
    # ⚠ 재해(태풍·한파 …)는 여기서 판정하지 않는다. 지역 특보 배너가 맡는다 —
    #   밭마다 재해 임박을 판정하는 경로를 두 개 두면 어긋난다(파일 머리).
    #   여기 있는 것은 재해가 아니라 **이 단계에 하는 농사일**이다.
    if (병해충 := _pest_candidate(inputs)) is not None:
        candidates.append(병해충)

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

    # ── 이 단계에 하는 농사일 ─────────────────────────────────────
    # 맨 뒤다. 등급도 low 다 — 물·수확·병해충이 먼저 읽혀야 한다.
    candidates.extend(_work_candidates(inputs))

    return candidates
