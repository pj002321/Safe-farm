"""LLM 에게 실제로 무엇을 건네는가. **DB·LLM 없이 문자열만 본다.**

`_build_prompt` 는 순수 함수다 — 이 파일이 지키는 것은 두 가지다.

  1. 전문어(NDVI·NDMI·증발산)가 프롬프트에 안 들어간다
     SYSTEM_PROMPT 가 "주어진 값만 근거로 삼아라" 라고 못박아 둬서, 숫자를 주면
     LLM 이 그 숫자를 답변에 그대로 적는다. 농민 화면에 NDVI 가 나가면 안 된다.
  2. 같은 말을 두 번 하지 않는다 — 카드(task_rules)와 같은 규칙을 쓴다
"""

import uuid

from app.domain.vegetation_text import Vegetation
from app.domain.water_balance import WaterBalance
from app.service.report import ReportInput, _build_prompt

마른날 = WaterBalance(
    balance_14d_mm=-52.7, rain_past_mm=0.1, rain_past_days=14, rain_3d_mm=0.0, rain_7d_mm=0.0
)


def 밭(**kw):
    바탕 = dict(
        cultivation_id=uuid.uuid4(),
        plot_name="아빠 논1번",
        crop_name_ko="벼",
        stage_name="생육기",
        guide_text=None,
        days_since_planting=139,
        accumulated_gdd=1800.0,
        gdd_target=None,
        stage_gdd_to=None,
        water_need_mm=None,
        fertilize_needed=False,
        water=마른날,
    )
    바탕.update(kw)
    return _build_prompt(ReportInput(**바탕))


# ── 위성 ──────────────────────────────────────────────────────


def test_위성이_없으면_그_줄이_아예_없다():
    """구름에 가려 90일에 한 점도 없을 수 있다. 그때도 리포트는 나온다."""
    prompt = 밭()
    assert "위성" not in prompt


def 위성줄(prompt: str) -> str:
    """'위성이 본 것' 줄만 떼어 본다.

    ⚠ 프롬프트 전체로 재면 안 된다 — 바로 아래 금지 지시문에 'NDVI' 라는 글자가
      일부러 들어 있다. 사실을 적는 줄과 지시하는 줄을 갈라 봐야 한다.
    """
    (줄,) = [x for x in prompt.splitlines() if x.startswith("위성이 본 것")]
    return 줄


def test_위성_수치가_아니라_말을_건넨다():
    prompt = 밭(
        vegetation=Vegetation(
            ndvi=0.787, ndmi_now=0.383, ndmi_before=0.42, gap_days=5, observed_on="2026-09-18"
        )
    )
    사실 = 위성줄(prompt)
    assert "(2026-09-18 관측)" in 사실
    assert "빽빽" in 사실
    # 숫자도 약어도 넘기지 않는다 — 주면 LLM 이 그대로 답변에 적는다
    assert "NDVI" not in 사실
    assert "0.787" not in 사실


def test_LLM_에게_약어를_쓰지_말라고_못박는다():
    prompt = 밭(vegetation=Vegetation(ndvi=0.787, observed_on="2026-09-18"))
    assert "NDVI·NDMI 같은 말은 쓰지 말고" in prompt


def test_위성_문장이_단계를_본다():
    """추수 앞둔 논에 '물기가 줄었다' 만 가면 LLM 이 헛걱정을 옮겨 적는다."""
    익는중 = Vegetation(
        ndvi=0.6, ndmi_now=0.344, ndmi_before=0.423, gap_days=10, observed_on="2026-09-18"
    )
    assert "자연스러운" in 위성줄(
        밭(stage_name="수확기", is_last_stage=True, stage_count=5, vegetation=익는중)
    )
    assert "줄었" in 위성줄(
        밭(stage_name="생육기", is_last_stage=True, stage_count=5, vegetation=익는중)
    )
    # ⚠ 여러 번 거두는 작물의 중간 수확은 익는 중이 아니다(고추: 풋고추 → 붉은고추)
    assert "줄었" in 위성줄(
        밭(stage_name="풋고추 수확", is_last_stage=False, stage_count=4, vegetation=익는중)
    )


# ── 물 ────────────────────────────────────────────────────────


def test_예보와_관측이_비슷하면_관측을_또_적지_않는다():
    """앞 문장이 이미 '2주 동안 비가 0.1mm' 라고 말했다."""
    prompt = 밭(rainfall_7d_mm=0.4)
    assert "2주 동안 비가 0.1mm" in prompt
    assert "관측소" not in prompt


def test_예보와_관측이_어긋나면_출처를_밝힌다():
    assert "관측소" in 밭(rainfall_7d_mm=18.0)


def test_전문어를_안_쓴다():
    prompt = 밭(rainfall_7d_mm=0.4)
    for 금지 in ("증발산", "수지", "ET0"):
        assert 금지 not in prompt


# ── GDD: '지금이 언제인가' ─────────────────────────────────────
#
# ★ 2026-09-19 — 예전에는 "누적 GDD 1764.7" 만 줬다. 그 숫자만으로는 모내기
#   직후인지 추수 직전인지 알 수가 없다. LLM 이 작물 상태를 못 맞히던 진짜 이유다.

익은논 = dict(stage_name=None, accumulated_gdd=1764.7, gdd_target=1749)


def test_누적_GDD_를_목표와_나란히_적는다():
    prompt = 밭(accumulated_gdd=800.0, gdd_target=1749)
    assert "누적 GDD 800.0 (다 자라는 데 필요한 양 1749)" in prompt


def test_목표를_넘었으면_넘었다고_적는다():
    assert "이미 넘었다" in 밭(**익은논)


def test_목표를_모르면_숫자만_적는다():
    """없는 분모를 지어내지 않는다."""
    prompt = 밭(accumulated_gdd=800.0, gdd_target=None)
    assert "누적 GDD 800.0" in prompt
    assert "필요한 양" not in prompt


def test_단계표를_지났으면_그_사실을_말한다():
    """★ 사용자의 논이 그랬다 — 마지막 단계가 GDD 1521 인데 누적이 1764.7 이었다.

    예전에는 stage_name 이 None 이라 단계 줄이 통째로 빠졌다. **모름과 끝남이
    같게 취급됐다** — 이 레포가 계속 경계해 온 그 실수다.
    """
    assert "생육 단계표의 마지막을 지났다" in 밭(**익은논)


def test_단계를_모르는_것과_지난_것은_다르다():
    """마스터 자료가 비어 단계를 모르는 경우는 여전히 침묵한다."""
    prompt = 밭(stage_name=None, accumulated_gdd=800.0, gdd_target=None)
    assert "단계표의 마지막" not in prompt


def test_위성_문장이_GDD_를_따라간다():
    """단계 이름이 없어도 익어 가는 중임을 안다.

    ⚠ 이게 없으면 물 빼고 추수 기다리는 논에 "잎의 물기가 줄었어요" 가 나간다.
      실제로 그렇게 나갔다.
    """
    익는중 = Vegetation(
        ndvi=0.727, ndmi_now=0.344, ndmi_before=0.423, gap_days=13, observed_on="2026-09-18"
    )
    사실 = 위성줄(밭(**익은논, vegetation=익는중))
    assert "자연스러운" in 사실
    assert "줄었" not in 사실
