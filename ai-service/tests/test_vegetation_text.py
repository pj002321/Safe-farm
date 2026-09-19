"""위성 지수를 사람 말로. DB·API 없이 순수 함수만 본다.

⚠ 임계값 숫자를 여기 베끼지 않는다. vegetation_text 에서 가져와 그 언저리로 만든다 —
  값을 고칠 때 테스트가 같이 따라오게 하려는 것이다.
"""

from app.domain.vegetation_text import (
    NDMI_MAX_GAP_DAYS,
    NDMI_STEP,
    NDVI_DENSE,
    NDVI_GROWING,
    NDVI_NONE,
    NDVI_SPARSE,
    describe_ndmi_trend,
    describe_ndvi,
    is_ripening_stage,
)

# ── NDVI — 절대 기준 ──────────────────────────────────────────────


def test_실측값이_실제_상태와_맞는_말로_나온다():
    """2026-09-19 전남 밭 3곳. 이 순서가 어긋나면 기준이 틀린 것이다."""
    assert "빽빽" in describe_ndvi(0.787)  # 벼 자라는 중
    assert "한창" in describe_ndvi(0.537)  # 양파 심은 지 얼마
    assert "성기" in describe_ndvi(0.270)  # 참깨 추수 후 맨땅
    assert "안 보여요" in describe_ndvi(-0.151)  # 좌표가 밭이 아님


def test_음수는_밭_위치를_의심하게_한다():
    """물·건물·아스팔트면 음수다. 좌표 오입력을 화면이 스스로 알려 주는 자리다."""
    말 = describe_ndvi(-0.35)
    assert "밭 위치" in 말


def test_경계값은_위쪽_칸에_든다():
    assert "빽빽" in describe_ndvi(NDVI_DENSE)
    assert "한창" in describe_ndvi(NDVI_DENSE - 0.001)
    assert "한창" in describe_ndvi(NDVI_GROWING)
    assert "성기" in describe_ndvi(NDVI_GROWING - 0.001)
    assert "성기" in describe_ndvi(NDVI_SPARSE)
    assert "거의 없어요" in describe_ndvi(NDVI_SPARSE - 0.001)
    assert "거의 없어요" in describe_ndvi(NDVI_NONE)
    assert "안 보여요" in describe_ndvi(NDVI_NONE - 0.001)


def test_값이_없으면_아무_말도_안_한다():
    assert describe_ndvi(None) is None


def test_숫자를_문장에_넣지_않는다():
    """0.787 은 차트가 보여 준다. 문장은 뜻만 말한다."""
    for v in (0.787, 0.27, -0.15):
        assert "0." not in describe_ndvi(v)


# ── NDMI — 변화만 ────────────────────────────────────────────────


def test_견줄_것이_없으면_침묵한다():
    """관측이 평균 18일에 한 번이라 하나뿐인 날이 흔하다. 침묵이 기본값이다."""
    assert describe_ndmi_trend(0.344) is None
    assert describe_ndmi_trend(0.344, None) is None
    assert describe_ndmi_trend(None, 0.423) is None


def test_줄었으면_줄었다고_한다():
    말 = describe_ndmi_trend(0.344, 0.423)
    assert "줄었" in 말


def test_늘었으면_늘었다고_한다():
    말 = describe_ndmi_trend(0.473, 0.394)
    assert "늘었" in 말


def test_거의_안_움직였으면_비슷하다고_한다():
    말 = describe_ndmi_trend(0.400, 0.390)
    assert "비슷" in 말


def test_임계_미만의_움직임은_비슷으로_본다():
    """반폭이 조금 달라진 것과 구분되지 않는 크기다(실측 폭 0.02~0.09)."""
    assert "비슷" in describe_ndmi_trend(0.40, 0.40 + NDMI_STEP * 0.9)
    assert "비슷" in describe_ndmi_trend(0.40, 0.40 - NDMI_STEP * 0.9)


def test_익어_가는_중이면_정상이라고_말해_준다():
    """사용자의 논이 실제로 그랬다 — 물을 뺀 뒤 0.423 → 0.344 인데 10월 추수 정상."""
    말 = describe_ndmi_trend(0.344, 0.423, is_ripening=True)
    assert "자연스러운" in 말
    assert "줄었" not in 말  # 걱정하게 만드는 말을 안 쓴다


def test_익어_가도_늘어난_것은_그대로_말한다():
    """is_ripening 은 **내림**에만 단서를 붙인다. 오름까지 뭉개면 사실이 아니다."""
    말 = describe_ndmi_trend(0.473, 0.394, is_ripening=True)
    assert "늘었" in 말


def test_너무_벌어진_관측은_견주지_않는다():
    """한 달 전과 견주는 것은 계절이 바뀐 것을 마름으로 읽는 일이다."""
    assert describe_ndmi_trend(0.344, 0.423, gap_days=NDMI_MAX_GAP_DAYS + 1) is None
    assert describe_ndmi_trend(0.344, 0.423, gap_days=NDMI_MAX_GAP_DAYS) is not None


def test_단정하는_말을_쓰지_않는다():
    """위성은 잎을 보지 뿌리도 흙도 못 본다."""
    말들 = [
        describe_ndmi_trend(0.344, 0.423),
        describe_ndmi_trend(0.344, 0.423, is_ripening=True),
        describe_ndmi_trend(0.473, 0.394),
    ]
    for 말 in 말들:
        for 금지 in ("말랐", "부족", "위험", "가뭄"):
            assert 금지 not in 말


# ── 익어 가는 단계 판정 ────────────────────────────────────────────


def test_수확_성숙_계열을_알아본다():
    for 이름 in ("수확", "붉은고추 수확", "성숙기", "등숙기", "황숙기", "익음때"):
        assert is_ripening_stage(이름) is True


def test_자라는_단계는_아니다():
    for 이름 in ("아주심기", "생육기", "결구기", "씨뿌림", "월동기"):
        assert is_ripening_stage(이름) is False


def test_단계를_모르면_거짓이다():
    """모름을 '정상' 으로 읽지 않는다 — is_soil_dry 와 같은 원칙이다."""
    assert is_ripening_stage(None) is False
    assert is_ripening_stage("") is False
