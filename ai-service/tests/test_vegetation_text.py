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
    Vegetation,
    describe_ndmi_trend,
    describe_ndvi,
    is_ripening_now,
    is_ripening_stage,
    summarize_points,
    vegetation_lines,
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


# ── 관측 묶기 ─────────────────────────────────────────────────


def 점(날짜, ndvi=0.5, ndmi=0.2):
    return {"date": 날짜, "ndvi": ndvi, "ndmi": ndmi}


def test_마지막이_가장_최근이다():
    """서버가 날짜 오름차순으로 준다는 전제다(satellite.py)."""
    v = summarize_points([점("2026-08-04", ndmi=0.42), 점("2026-09-05", ndmi=0.34)])
    assert v.observed_on == "2026-09-05"
    assert v.ndmi_now == 0.34
    assert v.ndmi_before == 0.42
    assert v.gap_days == 32  # 실측된 최장 공백


def test_관측이_하나뿐이면_앞이_없다():
    """구름 때문에 흔한 일이다 — 추세를 말하지 않는다."""
    v = summarize_points([점("2026-09-05")])
    assert v.ndmi_before is None
    assert v.gap_days is None
    # 잎 한 줄만 남는다 — 물기는 견줄 것이 없어 침묵한다
    assert vegetation_lines(v, "생육기") == [describe_ndvi(v.ndvi)]


def test_점이_없으면_빈_묶음이다():
    """90일에 한 점도 없을 수 있다. 그때도 리포트는 나와야 한다."""
    for 없음 in (None, []):
        v = summarize_points(없음)
        assert v.observed_on is None
        assert vegetation_lines(v, "생육기") == []


def test_날짜_형태가_다르면_간격을_세지_않는다():
    """억지로 세느니 None 이다 — 그러면 문장 쪽이 견주기를 포기한다."""
    v = summarize_points([점("언젠가"), 점("2026-09-05")])
    assert v.gap_days is None


# ── 단계를 아는 유일한 자리 ────────────────────────────────────


물기준것 = Vegetation(ndvi=0.6, ndmi_now=0.344, ndmi_before=0.423, gap_days=10)


def test_마지막_수확_단계면_물기가_준_것을_정상이라고_말한다():
    """화면(SatellitePanel)은 작물을 몰라 isRipening=false 지만 리포트는 단계를 안다."""
    말 = " ".join(vegetation_lines(물기준것, "수확기", is_last_stage=True, stage_count=5))
    assert "자연스러운" in 말
    assert "줄었" not in 말


def test_자라는_단계면_준_것을_준_대로_말한다():
    assert "줄었" in " ".join(
        vegetation_lines(물기준것, "생육기", is_last_stage=True, stage_count=5)
    )


def test_여러_번_거두는_작물의_중간_수확은_익는_중이_아니다():
    """★ 고추는 `풋고추 수확 → 붉은고추 수확` 이고 그동안 나무는 계속 자란다.

    마지막인지 안 보고 '수확' 만으로 판정하면 **여름 가뭄으로 잎이 마르는 것을
    '자연스러운 변화' 라고 덮는다.** 안 맞는 조언 한 번이 나머지까지 못 믿게 만든다.
    """
    말 = " ".join(vegetation_lines(물기준것, "풋고추 수확", is_last_stage=False, stage_count=4))
    assert "줄었" in 말
    assert "자연스러운" not in 말


def test_단계표를_지났으면_단계_이름_없이도_익는_중이다():
    """단계표가 수확 전에 끝나는 작물이 많다(고구마는 '덩이뿌리비대기' 가 마지막).
    실측 — 익음 낱말이 없는 14품종이 전부 gdd_target 을 갖고 있어 이쪽이 받는다."""
    말 = " ".join(vegetation_lines(물기준것, None, past_gdd_target=True))
    assert "자연스러운" in 말


def test_익는_중_판정은_두_길_중_하나면_된다():
    # ① 목표를 넘었다 — 작물을 안 가린다
    assert is_ripening_now(None, past_gdd_target=True) is True
    # ② 익음 낱말 + 마지막 단계
    assert is_ripening_now("수확할때", is_last_stage=True, stage_count=6) is True
    # 낱말만으로는 안 된다
    assert is_ripening_now("풋고추 수확", is_last_stage=False, stage_count=4) is False
    # 마지막이어도 익음 낱말이 아니면 아니다
    assert is_ripening_now("덩이뿌리비대기", is_last_stage=True, stage_count=2) is False
    # 아무 근거도 없으면 거짓 — 모름을 '정상' 으로 읽지 않는다
    assert is_ripening_now(None) is False


def test_단계가_하나뿐이면_그_이름을_믿지_않는다():
    """★ 상추 단계표가 '수확' 한 칸(GDD 0~573)이다 — 심은 날부터 마지막 수확 단계다.

    막지 않으면 **32%밖에 안 자란 상추가 "익어 가는 중"** 이 되고, 그때 잎이
    마르면 가뭄을 "자연스러운 변화" 라고 덮는다. 상추는 지금 사용자 밭에서
    가장 많이 기르는 작물이다(딸기 '수확 기간' · 아욱 '수확' 도 같은 모양).
    """
    assert is_ripening_now("수확", is_last_stage=True, stage_count=1) is False
    # 목표를 넘으면 그때는 참이다 — 그건 이름이 아니라 온도가 대는 근거다
    assert is_ripening_now("수확", is_last_stage=True, stage_count=1, past_gdd_target=True) is True
    # 단계가 둘 이상이면 이름을 믿는다
    assert is_ripening_now("수확", is_last_stage=True, stage_count=2) is True


def test_단계_수를_안_넘기면_낱말_판정이_안_돈다():
    """기본값이 0 이라 **부르는 쪽이 빠뜨리면 조용히 참이 되는 일이 없다.**
    없으면 거짓 — 이 레포가 지켜 온 원칙이다."""
    assert is_ripening_now("수확할때", is_last_stage=True) is False


def test_묶어_낸_문장에도_숫자를_안_넣는다():
    """농민 화면에도 프롬프트에도 NDVI 라는 말이 나가면 안 된다.

    ⚠ 위 `test_숫자를_문장에_넣지_않는다` 는 describe_ndvi 한 줄을 보고, 이건
      vegetation_lines 가 묶어 낸 여러 줄을 본다. 이름을 같게 뒀더니 뒤엣것이
      앞엣것을 덮어 **앞 테스트가 아예 안 돌았다**(ruff F811 이 잡았다).
    """
    v = Vegetation(ndvi=0.787, ndmi_now=0.383, ndmi_before=0.42, gap_days=5)
    for 줄 in vegetation_lines(v, "생육기"):
        assert "NDVI" not in 줄
        assert "0." not in 줄
