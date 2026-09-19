"""물 사정 판정. DB·API 없이 순수 함수만 본다.

⚠ **숫자를 여기 다시 적지 않는다.** 임계값은 water_balance 에서 가져와 그 언저리로
  만든다 — 값을 고칠 때 테스트가 같이 따라오게 하려는 것이다. 상수를 베껴 두면
  임계를 옮겼을 때 테스트는 통과하는데 동작이 달라진다.
"""

from app.domain.water_balance import (
    BALANCE_DRY_MM,
    RAIN_HEAVY_MM,
    RAIN_SOON_MM,
    SOIL_DRY,
    WaterBalance,
    dryness_note,
    is_soil_dry,
    judge_water,
)

마름 = BALANCE_DRY_MM - 10  # 확실히 마른 수지
젖음 = BALANCE_DRY_MM + 10  # 확실히 균형인 수지
큰비 = RAIN_HEAVY_MM + 10
곧비 = RAIN_SOON_MM + 5


def test_주지_마라가_모든_판정에_앞선다():
    """2주 가물었어도 큰 비가 오면 물을 주라고 하면 안 된다.

    순서가 규칙의 일부다 — 먼저 판정한 쪽이 뒤를 묻어 버린다.
    """
    b = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, rain_7d_mm=큰비)
    assert judge_water(b) == "hold"


def test_말랐고_비가_없으면_물_줘라():
    b = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, rain_7d_mm=0.0)
    assert judge_water(b) == "give"


def test_말랐지만_사흘_안에_비가_오면_신경만():
    b = WaterBalance(balance_14d_mm=마름, rain_3d_mm=곧비, rain_7d_mm=곧비)
    assert judge_water(b) == "watch"


def test_수지가_균형이면_카드가_없다():
    b = WaterBalance(balance_14d_mm=젖음, rain_3d_mm=0.0, rain_7d_mm=0.0)
    assert judge_water(b) == "skip"


def test_경계값은_마른_쪽에_안_넣는다():
    """`> BALANCE_DRY_MM` 이므로 딱 그 값이면 마른 것이다. 경계를 명시해 둔다."""
    assert judge_water(WaterBalance(balance_14d_mm=BALANCE_DRY_MM, rain_3d_mm=0.0)) == "give"
    assert judge_water(WaterBalance(balance_14d_mm=BALANCE_DRY_MM + 0.1, rain_3d_mm=0.0)) == "skip"


def test_예보_경계는_포함이다():
    """`>=` 다 — 딱 임계면 '비가 온다'·'큰 비다' 로 본다."""
    assert judge_water(WaterBalance(balance_14d_mm=마름, rain_7d_mm=RAIN_HEAVY_MM)) == "hold"
    assert (
        judge_water(WaterBalance(balance_14d_mm=마름, rain_3d_mm=RAIN_SOON_MM, rain_7d_mm=0.0))
        == "watch"
    )


def test_수지를_모르면_기권한다():
    """토양수분만으로는 판정하지 않는다 — 모델값 하나에 조언을 걸 수 없다."""
    assert judge_water(WaterBalance(balance_14d_mm=None, rain_3d_mm=0.0)) is None
    assert judge_water(WaterBalance(balance_14d_mm=None, soil_moisture=0.05)) is None


def test_아무것도_모르면_None():
    assert judge_water(WaterBalance()) is None


def test_예보를_모르면_비가_없는_것으로_본다():
    """마른 것은 이미 사실이다. 예보가 없다고 조언을 접으면 필요한 날에 아무 말도 못 한다."""
    assert judge_water(WaterBalance(balance_14d_mm=마름)) == "give"


def test_큰비만_알아도_주지_마라는_선다():
    """수지를 몰라도 큰 비 예보 하나로 '주지 마라' 는 말할 수 있다."""
    assert judge_water(WaterBalance(balance_14d_mm=None, rain_7d_mm=큰비)) == "hold"


def test_비가_0mm_인_것과_모르는_것은_다르다():
    """0.0 은 '안 왔다', None 은 '모른다' — 같은 판정이어도 뜻이 다르다."""
    영 = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, rain_7d_mm=0.0)
    없음 = WaterBalance(balance_14d_mm=마름)
    assert judge_water(영) == judge_water(없음) == "give"
    # 문장에서는 갈린다 — 0mm 는 근거로 적히고 None 은 안 적힌다
    assert "0mm" in (dryness_note(영) or "")
    assert "예보" not in (dryness_note(없음) or "")


def test_토양수분은_판정을_안_뒤집고_등급만_거든다():
    마른흙 = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, soil_moisture=SOIL_DRY - 0.05)
    젖은흙 = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, soil_moisture=SOIL_DRY + 0.05)
    assert judge_water(마른흙) == judge_water(젖은흙) == "give"  # 판정은 같다
    assert is_soil_dry(마른흙) is True
    assert is_soil_dry(젖은흙) is False


def test_토양수분을_모르면_마른_것으로_보지_않는다():
    assert is_soil_dry(WaterBalance(soil_moisture=None)) is False


def test_근거_문장은_숫자와_기간만_말한다():
    b = WaterBalance(balance_14d_mm=-52.7, rain_3d_mm=0.0, rain_7d_mm=3.0)
    note = dryness_note(b)
    assert note is not None
    assert "-53mm" in note and "14일" in note
    # 단정하는 말과 못 보는 현상을 쓰지 않는다
    for 금지 in ("마릅니다", "부족", "장마", "말랐"):
        assert 금지 not in note


def test_근거가_없으면_문장도_없다():
    assert dryness_note(WaterBalance()) is None


def test_조사에_적힌_대전_실측값이_물_줘라로_떨어진다():
    """조사_물조언_데이터선택 §4-1 — 대전 36.35,127.38 · Open-Meteo 한 번 호출.

    과거 14일 강수 0.1mm − ET0 52.8mm = −52.7 · 예보 7일 3.0mm · 토양수분 0.303
    """
    b = WaterBalance(balance_14d_mm=-52.7, rain_3d_mm=0.0, rain_7d_mm=3.0, soil_moisture=0.303)
    assert judge_water(b) == "give"
