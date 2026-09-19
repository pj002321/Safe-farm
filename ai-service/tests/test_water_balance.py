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
    # 문장에서는 갈린다 — 0mm 예보는 "비 소식이 없어요" 로 적히고 None 은 안 적힌다
    assert "비 소식이 없어요" in (dryness_note(영) or "")
    assert "3일" not in (dryness_note(없음) or "")


def test_토양수분은_판정을_안_뒤집고_등급만_거든다():
    마른흙 = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, soil_moisture=SOIL_DRY - 0.05)
    젖은흙 = WaterBalance(balance_14d_mm=마름, rain_3d_mm=0.0, soil_moisture=SOIL_DRY + 0.05)
    assert judge_water(마른흙) == judge_water(젖은흙) == "give"  # 판정은 같다
    assert is_soil_dry(마른흙) is True
    assert is_soil_dry(젖은흙) is False


def test_토양수분을_모르면_마른_것으로_보지_않는다():
    assert is_soil_dry(WaterBalance(soil_moisture=None)) is False


def test_근거_문장이_사람_말이다():
    """★ 2026-09-19 — '증발산 -53mm' 를 농민이 읽을 말로 바꿨다."""
    b = WaterBalance(
        balance_14d_mm=-52.7,
        rain_past_mm=0.1,
        rain_past_days=14,
        rain_3d_mm=0.0,
        rain_7d_mm=0.0,
    )
    note = dryness_note(b)
    assert note is not None
    # 실제로 내린 비를 말한다. 수지(-52.7)가 아니다
    assert "0.1mm" in note
    assert "2주" in note
    assert "비 소식이 없어요" in note


def test_전문어를_문장에_쓰지_않는다():
    """'증발산'·'수지' 는 농민이 쓰는 말이 아니다. 계산에는 쓰고 문장에서만 감춘다."""
    b = WaterBalance(
        balance_14d_mm=-52.7,
        rain_past_mm=0.1,
        rain_past_days=14,
        rain_3d_mm=0.0,
        rain_7d_mm=0.0,
    )
    note = dryness_note(b) or ""
    for 금지 in ("증발산", "수지", "누적", "GDD", "mm뿐이었습니다"):
        assert 금지 not in note


def test_단정하는_말과_못_보는_현상을_쓰지_않는다():
    for b in (
        WaterBalance(balance_14d_mm=-52.7, rain_past_mm=0.1, rain_past_days=14, rain_3d_mm=0.0),
        WaterBalance(balance_14d_mm=-52.7, rain_past_mm=2.0, rain_past_days=14, rain_7d_mm=65.0),
    ):
        note = dryness_note(b) or ""
        for 금지 in ("마릅니다", "부족", "장마", "말랐", "위험"):
            assert 금지 not in note


def test_비가_제법_왔으면_다르게_말한다():
    """1mm 아래는 '~뿐이었어요', 그 위는 '내린 비가 ~예요'. 0mm 를 '내린 비' 라 하면 어색하다."""
    적음 = dryness_note(WaterBalance(rain_past_mm=0.1, rain_past_days=14)) or ""
    많음 = dryness_note(WaterBalance(rain_past_mm=23.0, rain_past_days=14)) or ""
    assert "뿐이었어요" in 적음
    assert "뿐이었어요" not in 많음
    assert "23mm" in 많음


def test_기간을_주로_센다():
    """★ 2026-09-19 — '사흘'·'이레' 를 걷어 냈다. 사흘과 나흘을 헷갈리는 사람이 많다.

    이레를 넘으면 주로 센다 — "14일" 보다 "2주" 가 얼마나 긴지 바로 잡힌다.
    """

    def 말(일수):
        return dryness_note(WaterBalance(rain_past_mm=0.1, rain_past_days=일수)) or ""

    assert "3일" in 말(3)
    assert "일주일" in 말(7)
    assert "2주" in 말(14)
    # 딱 떨어지지 않으면 날로 둔다 — "1주 3일" 은 읽다가 멈추게 된다
    assert "10일" in 말(10)
    # 옛말이 하나도 안 남아야 한다
    for 옛말 in ("사흘", "나흘", "이레", "열나흘", "두 주"):
        assert 옛말 not in 말(3) + 말(7) + 말(14)


def test_강수를_못_받았으면_수지를_풀어_말한다():
    """balance 만 있고 rain_past 가 없는 호출. 숫자 대신 뜻을 적는다."""
    note = dryness_note(WaterBalance(balance_14d_mm=-52.7)) or ""
    assert "마른 날이 많았어요" in note
    assert "-53" not in note


def test_날수를_모르면_None일_이_새어_나가지_않는다():
    """WaterBalance 는 밖에서도 만들 수 있는 자료형이다 — 한 칸만 채워도 말이 돼야 한다."""
    note = dryness_note(WaterBalance(rain_past_mm=0.1)) or ""
    assert "None" not in note
    assert "0.1mm" in note


def test_비가_넉넉했는데_마른_날이_많았다고_하지_않는다():
    """수지가 양수면 비가 증발산보다 많았다는 뜻이다. 거꾸로 적으면 거짓말이 된다."""
    note = dryness_note(WaterBalance(balance_14d_mm=30.0)) or ""
    assert "마른 날이 많았어요" not in note


def test_비가_왔던_밭에는_앞으로_3일_도_라고_잇지_않는다():
    """'도' 는 앞 문장이 가물었다고 말했을 때만 이어진다."""
    note = dryness_note(WaterBalance(rain_past_mm=60.0, rain_past_days=14, rain_3d_mm=0.0)) or ""
    assert "앞으로 3일은" in note
    assert "앞으로 3일도" not in note


def test_근거가_없으면_문장도_없다():
    assert dryness_note(WaterBalance()) is None


def test_조사에_적힌_대전_실측값이_물_줘라로_떨어진다():
    """조사_물조언_데이터선택 §4-1 — 대전 36.35,127.38 · Open-Meteo 한 번 호출.

    과거 14일 강수 0.1mm − ET0 52.8mm = −52.7 · 예보 7일 3.0mm · 토양수분 0.303
    """
    b = WaterBalance(balance_14d_mm=-52.7, rain_3d_mm=0.0, rain_7d_mm=3.0, soil_moisture=0.303)
    assert judge_water(b) == "give"


def test_관측을_밝히는_기준이_한_곳이다():
    """카드와 리포트가 같은 함수를 쓴다 — 한쪽만 붙이면 근거가 어긋난다."""
    from app.domain.water_balance import RAIN_DISAGREE_MM, 관측을_밝힐까

    # 비슷하면 같은 말을 두 번 하지 않는다
    assert 관측을_밝힐까(0.1, 0.4) is False
    assert 관측을_밝힐까(0.1, 0.1 + RAIN_DISAGREE_MM - 0.1) is False
    # 어긋나면 출처를 밝힌다 — "우리 동네는 비 왔는데?" 를 막는 자리다
    assert 관측을_밝힐까(0.1, 18.0) is True
    assert 관측을_밝힐까(0.1, 0.1 + RAIN_DISAGREE_MM) is True
    # 예보를 모르면 관측이 유일한 근거다
    assert 관측을_밝힐까(None, 3.0) is True
    # 관측이 없으면 적을 것이 없다
    assert 관측을_밝힐까(0.1, None) is False


def test_토양수분_0_은_마름이_아니라_흙이_아님이다():
    """★ 2026-09-19 — '서해에 땅이 있어요' 밭이 0.000 이었다.

    바다 위 좌표에서 정확히 0 이 온다. 그걸 "가장 마름" 으로 읽으면 **바다에 물을
    주라고 등급을 올린다.** 진짜 마른 흙도 위조점 언저리라 0.05~0.15 는 된다.
    """
    from app.domain.water_balance import SOIL_NO_DATA, is_soil_dry

    assert is_soil_dry(WaterBalance(soil_moisture=SOIL_NO_DATA)) is False
    # 아주 마른 흙은 그대로 잡힌다
    assert is_soil_dry(WaterBalance(soil_moisture=0.05)) is True
