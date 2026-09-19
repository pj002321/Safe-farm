"""위성 지수(NDVI·NDMI)를 농민이 읽을 한 줄로 바꾼다. **보여주기만 한다.**

    NDVI 0.787  ->  "잎이 빽빽하게 덮였어요"

⚠ **판정에 쓰지 않는다.** 물을 줄지 말지는 `water_balance.judge_water` 가 기상으로
  정한다. 위성을 판정에 넣는 것은 별건이고(교차 검증 — 조사 §4-4), 이 파일은
  화면과 프롬프트에 붙일 **말**만 만든다.

⚠ **LLM 을 쓰지 않는다.** 가를 축이 NDVI 5칸 · NDMI 방향 4칸 · 단계 2칸뿐이라
  한 줄씩 따로 내보내면 문장 11개면 끝난다. `stage_name` 138종을 분기하면 규칙이
  못 버티지만, 우리는 그것을 안 쓴다.

DB·LLM 의존 없음 — 부르는 쪽이 값을 모아 넘긴다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

# ─────────────────────────────────────────────────────────────────────
# NDVI — 잎이 얼마나 덮고 있나. **절대 기준이 선다.**
#
# 작물이 달라도 뜻이 비슷해서 칸을 나눌 수 있다. 2026-09-19 실측(전남 밭 3곳)이
# 그것을 보여 준다 —
#
#     +0.79  벼 자라는 중        +0.54  양파 심은 지 얼마
#     +0.27  참깨 추수 후 맨땅    −0.15  좌표가 밭이 아님
#
# 순서가 실제 상태와 정확히 맞고, 원격탐사 통례와도 어긋나지 않는다
# (맨땅 0.1~0.2 · 성긴 식생 0.2~0.5 · 무성 0.6~0.9).
# ─────────────────────────────────────────────────────────────────────
NDVI_DENSE = 0.60
NDVI_GROWING = 0.40
NDVI_SPARSE = 0.20
NDVI_NONE = 0.0

# ─────────────────────────────────────────────────────────────────────
# NDMI — 잎 속 수분. ⚠ **절대 기준을 쓰면 안 된다.**
#
# NDMI 는 NDVI 에 딸려 움직인다. 잎이 적으면 자동으로 낮게 나온다 —
# 양파의 +0.135 는 **말라서가 아니라 잎이 아직 성겨서**다. 그것을 "물이 부족하다"
# 로 읽으면 틀린 말이 된다. 그래서 **같은 밭의 변화**로만 말한다.
#
# 0.05 인 까닭: 실측에서 반폭을 5~30m 로 바꿨을 때 폭이 0.02~0.09 였다(§1-1-b).
# 그보다 작은 움직임은 조회 영역이 조금 달라진 것과 구분되지 않는다.
# ─────────────────────────────────────────────────────────────────────
NDMI_STEP = 0.05

# 관측 사이가 이보다 벌어지면 견주지 않는다.
#
# ⚠ 관측이 평균 18일에 한 번이고 최장 공백이 32일이다(2026-09-19 실측 · 90일 5건).
#   한 달 전과 견주는 것은 **계절이 바뀐 것을 마름으로 읽는 일**이다.
NDMI_MAX_GAP_DAYS = 30


def crop_is_standing(ndvi: float | None) -> bool:
    """밭에 작물이 **아직 서 있나.** 값이 없으면 거짓 — 모름을 있음으로 읽지 않는다.

    ★ 이 판정은 작물을 안 가린다. 2026-09-19 실측(사용자 밭 3곳)이 근거다 —

        벼 자라는 중      +0.79   ┐
        양파 심은 지 얼마  +0.54   ┘ 서 있다
        ───────────────  0.40 ────────────
        참깨 추수 후      +0.27   ┐ 거뒀다(맨땅)
        밭이 아닌 좌표     −0.15   ┘

      거둔 밭과 서 있는 밭 사이에 이미 쓰던 칸 경계(NDVI_GROWING)가 그대로 놓인다.
      NDVI 는 절대 기준이 서기 때문에 벼든 참깨든 같은 선으로 갈린다(위 ⚠ 참고).

    ⚠ **잎을 볼 뿐 그게 우리 작물인지는 모른다.** 추수 뒤에 호밀·헤어리베치를
      뿌렸거나 잡초가 덮으면 다시 올라간다. 그래서 이 값으로 "거두세요" 를 단정하지
      말고 "거둘 때가 됐으니 밭을 보세요" 까지만 말한다 — 틀려도 나가 보면 된다.

    ⚠ **거둬도 밭에 남는 작물에는 쓰면 안 된다**(과수·부추·아스파라거스…).
      가르는 일은 여기가 아니라 `task_rules.harvest_clears_field` 가 한다.
    """
    return ndvi is not None and ndvi >= NDVI_GROWING


def describe_ndvi(ndvi: float | None) -> str | None:
    """NDVI 한 값을 사람 말로. 값이 없으면 None — 침묵이 기본값이다.

    ⚠ 숫자를 문장에 넣지 않는다. '0.787' 은 차트가 보여 준다.

    # examples
        describe_ndvi(0.787)  -> '잎이 빽빽하게 덮였어요.'
        describe_ndvi(-0.15)  -> '식물이 안 보여요. 밭 위치가 맞는지 확인해 주세요.'
    """
    if ndvi is None:
        return None
    if ndvi >= NDVI_DENSE:
        return "잎이 빽빽하게 덮였어요."
    if ndvi >= NDVI_GROWING:
        return "잎이 한창 자라고 있어요."
    if ndvi >= NDVI_SPARSE:
        return "잎이 성기거나 이제 올라오는 중이에요."
    if ndvi >= NDVI_NONE:
        return "잎이 거의 없어요. 심기 전이거나 거둔 뒤로 보여요."
    # ⚠ 음수는 **식생이 아니라는 뜻**이다(물·건물·아스팔트). 좌표를 잘못 찍었을 때
    #   화면이 스스로 알려 주는 자리다 — 실측에서 임의 좌표가 −0.15 였다.
    return "식물이 안 보여요. 밭 위치가 맞는지 확인해 주세요."


def describe_ndmi_trend(
    now: float | None,
    before: float | None = None,
    *,
    is_ripening: bool = False,
    gap_days: int | None = None,
) -> str | None:
    """NDMI 의 **변화**를 사람 말로. 견줄 것이 없으면 None.

    # params
    now: 가장 최근 관측<br>
    before: 그 앞 관측. 없으면 None — 관측이 하나뿐인 날이 흔하다<br>
    is_ripening: 지금이 익어 가는 단계인가(수확·성숙·익음·등숙)<br>
    gap_days: 두 관측 사이 날수. 너무 벌어지면 견주지 않는다<br>

    ⚠ **익어 가는 중이면 내림이 정상이다.** 이 단서가 없으면 농민이 "물을 줘야 하나"
      로 읽는다 — 실제로 사용자의 논이 물을 뺀 뒤 0.423 → 0.344 로 떨어졌는데
      10월 추수를 앞둔 정상 상태였다(2026-09-19).

    ⚠ 단정하지 않는다. '말랐습니다' 가 아니라 '물기가 줄고 있어요' 다 —
      위성은 잎을 보지 뿌리도 흙도 못 본다.

    # examples
        describe_ndmi_trend(0.344, 0.423, is_ripening=True)
        -> '익어 가면서 잎이 마르는 중이에요. 이맘때는 자연스러운 변화예요.'
    """
    if now is None or before is None:
        return None
    if gap_days is not None and gap_days > NDMI_MAX_GAP_DAYS:
        return None

    차이 = now - before
    if 차이 <= -NDMI_STEP:
        if is_ripening:
            return "익어 가면서 잎이 마르는 중이에요. 이맘때는 자연스러운 변화예요."
        return "잎의 물기가 지난번보다 줄었어요."
    if 차이 >= NDMI_STEP:
        return "잎의 물기가 지난번보다 늘었어요."
    return "잎의 물기는 지난번과 비슷해요."


# 단계 이름에 이 낱말이 있으면 '익어 가는 중' 으로 본다.
#
# ⚠ **지금은 글자로 판정한다.** crop_stages 520행 중 148행이 걸린다.
#   crop-data 의 `단계낱말` 과 같은 방식이다 — 더 나은 길은 단계마다 성격을
#   칸으로 다는 것인데, 그건 마스터 쪽 일이라 다음 기회로 미뤘다.
_RIPENING_WORDS = ("수확", "성숙", "익음", "등숙", "완숙", "황숙", "호숙", "유숙")


def is_ripening_stage(stage_name: str | None) -> bool:
    """이 단계가 익어 가는 때인가. 단계를 모르면 거짓 — 모름을 정상으로 읽지 않는다."""
    return any(w in (stage_name or "") for w in _RIPENING_WORDS)


# ─────────────────────────────────────────────────────────────────────
# 한 밭의 관측 묶음 — 부르는 쪽(report.py·화면)이 이 모양으로 모아 넘긴다
# ─────────────────────────────────────────────────────────────────────


@dataclass
class Vegetation:
    """위성이 본 것. **비어 있는 것이 기본값이다.**

    구름과 재방문 주기 때문에 관측이 평균 18일에 한 번밖에 안 남는다(실측 ·
    sentinelhub_client 머리). 그래서 "값이 없다" 가 흔한 정상이고, 비어 있으면
    문장이 빠질 뿐 리포트는 그대로 나온다 — `WaterBalance` 와 같은 원칙이다.
    """

    #: 가장 최근 관측의 NDVI
    ndvi: float | None = None
    #: 가장 최근 관측의 NDMI
    ndmi_now: float | None = None
    #: 그 앞 관측의 NDMI. 하나뿐이면 None — 추세를 말하지 않는다
    ndmi_before: float | None = None
    #: 두 관측 사이 날수. 크게 벌어지면 견주지 않는다(NDMI_MAX_GAP_DAYS)
    gap_days: int | None = None
    #: 가장 최근 관측일 "YYYY-MM-DD". 언제 본 것인지 안 밝히면 사용자는
    #: "왜 값이 안 변하지" 를 알 수 없다
    observed_on: str | None = None


def _날수(앞: str, 뒤: str) -> int | None:
    """ "YYYY-MM-DD" 두 개의 날수 차이. 형태가 다르면 None — 억지로 세지 않는다."""
    try:
        return (date.fromisoformat(뒤) - date.fromisoformat(앞)).days
    except (TypeError, ValueError):
        return None


def summarize_points(points: list[dict] | None) -> Vegetation:
    """`/v1/satellite/observations` 의 점들을 한 묶음으로 줄인다.

    ⚠ **'2주 전' 같은 고정 간격을 쓰지 않는다.** 관측이 드물어(최장 공백 32일 실측)
      그 날짜에 값이 있을 거라는 보장이 없다. 있는 것 중 **가까운 둘**을 쓰고,
      간격이 벌어졌는지는 `gap_days` 로 넘겨 판단을 문장 쪽에 맡긴다.

    ⚠ 서버가 날짜 오름차순으로 준다는 전제다(satellite.py). 마지막이 가장 최근이다.
    """
    if not points:
        return Vegetation()
    끝 = points[-1]
    앞 = points[-2] if len(points) >= 2 else None
    return Vegetation(
        ndvi=끝.get("ndvi"),
        ndmi_now=끝.get("ndmi"),
        ndmi_before=앞.get("ndmi") if 앞 else None,
        gap_days=_날수(앞["date"], 끝["date"]) if 앞 else None,
        observed_on=끝.get("date"),
    )


def is_ripening_now(
    stage_name: str | None,
    *,
    is_last_stage: bool = False,
    stage_count: int = 0,
    past_gdd_target: bool = False,
) -> bool:
    """지금이 익어 가는 때인가. **두 길 중 하나만 참이면 된다.**

        ① 쌓인 온도가 목표를 넘었다            작물을 안 가린다. 가장 믿을 만하다
        ② 단계 이름이 익음 계열이고 **마지막 단계**다 (단계가 둘 이상일 때만)

    ⚠ ②에서 '마지막' 을 빼면 안 된다. 여러 번 거두는 작물은 수확이 중간에 온다 —
      고추가 `풋고추 수확 → 붉은고추 수확` 이고 그동안 나무는 계속 자란다.
      마지막인지 안 보면 **여름 가뭄으로 잎이 마르는 것을 "자연스러운 변화" 라고
      덮는다.** 안 맞는 조언 한 번이 나머지 조언까지 못 믿게 만든다.

    ⚠ **단계가 하나뿐이면 이름을 믿지 않는다.** 그 이름은 어느 시기를 가리키는
      말이 아니라 한살이 전체를 부르는 말이다. 2026-09-19 실측 —

          상추   단계 1개  '수확'      GDD 0~573    ← 심은 날부터 '수확' 이다
          딸기   단계 1개  '수확 기간'  GDD 0~708
          아욱   단계 1개  '수확'      GDD 0~606

      이걸 막지 않으면 32% 자란 상추가 "익어 가는 중" 이 된다. 상추는 지금
      사용자 밭에서 가장 많이 기르는 작물이다.

    ⚠ ①이 ②의 안전망이다. 단계표가 수확 전에 끝나는 작물이 많다(고구마는
      '덩이뿌리비대기' 가 마지막). 실측 — 익음 낱말이 하나도 없는 14품종이
      **전부 gdd_target 을 갖고 있어** ①이 받는다. 상추도 ①로 판정된다.
    """
    if past_gdd_target:
        return True
    if stage_count < 2:
        return False
    return is_last_stage and is_ripening_stage(stage_name)


def vegetation_lines(
    v: Vegetation,
    stage_name: str | None,
    *,
    is_last_stage: bool = False,
    stage_count: int = 0,
    past_gdd_target: bool = False,
) -> list[str]:
    """이 밭에 대해 위성이 할 수 있는 말. 할 말이 없으면 빈 목록이다.

    ⚠ **여기가 단계를 아는 유일한 자리다.** 화면 쪽 `SatellitePanel` 은 작물을
      몰라서 `isRipening: false` 로 두는데, 리포트는 `stage_name` 을 이미 들고
      있다. 익어 가는 중이면 물기가 주는 것이 정상이라고 말해 줘야 한다 —
      추수 앞둔 논에 "물이 줄었다" 만 보이면 사용자가 헛걱정한다.

    ⚠ **`past_gdd_target` 이 필요한 까닭.** 단계표를 다 지나면 `stage_name` 이
      None 이 되어 글자 판정이 통째로 거짓이 된다. 정작 그때가 가장 익은 때인데도
      말이다 — 실제로 사용자의 논(GDD 1764.7 / 목표 1749)에서 그 일이 났다.
      물 빼고 추수 기다리는 논에 "잎의 물기가 줄었어요" 가 그대로 나갔다.
      단계 이름이 없을 때 **GDD 가 유일한 단서**다.
    """
    말: list[str] = []
    잎 = describe_ndvi(v.ndvi)
    if 잎:
        말.append(잎)
    물기 = describe_ndmi_trend(
        v.ndmi_now,
        v.ndmi_before,
        is_ripening=is_ripening_now(
            stage_name,
            is_last_stage=is_last_stage,
            stage_count=stage_count,
            past_gdd_target=past_gdd_target,
        ),
        gap_days=v.gap_days,
    )
    if 물기:
        말.append(물기)
    return 말
