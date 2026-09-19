"""작업카드 판정. DB·API 없이 순수 함수만 본다.

★ 2026-09-19 — 물 규칙이 `water_need_mm` 을 떠나면서 전부 다시 썼다.
  예전 테스트는 `recent_rain_mm < water_need_mm` 을 검증했는데, 그 칸이 520행 내내
  비어 있어 **실제로는 한 번도 참이 된 적이 없는 조건**이었다.

⚠ 임계값 숫자를 여기 베끼지 않는다. water_balance 에서 가져와 그 언저리로 만든다.
"""

from app.domain.task_rules import DRY_MM, PlotTaskInputs, build_task_candidates
from app.domain.water_balance import BALANCE_DRY_MM, RAIN_HEAVY_MM, SOIL_DRY, WaterBalance

마른날 = WaterBalance(balance_14d_mm=BALANCE_DRY_MM - 10, rain_3d_mm=0.0, rain_7d_mm=0.0)
비올날 = WaterBalance(balance_14d_mm=BALANCE_DRY_MM - 10, rain_3d_mm=20.0, rain_7d_mm=30.0)
큰비날 = WaterBalance(balance_14d_mm=BALANCE_DRY_MM - 10, rain_7d_mm=RAIN_HEAVY_MM + 10)
평범한날 = WaterBalance(balance_14d_mm=BALANCE_DRY_MM + 10, rain_3d_mm=0.0, rain_7d_mm=0.0)


def 밭(**kw):
    바탕 = dict(crop_name_ko="배추", stage_name="결구기")
    바탕.update(kw)
    return PlotTaskInputs(**바탕)


def 제목들(inputs):
    return [c.title for c in build_task_candidates(inputs)]


# ── 아무 근거도 없을 때 ────────────────────────────────────────────


def test_아무_값도_없으면_카드가_없다():
    """기상도 시기도 모르면 침묵한다. '괜찮습니다' 도 하나의 주장이다."""
    assert build_task_candidates(밭(stage_name=None)) == []


def test_기상을_몰라도_시비는_나간다():
    """외부 API 장애로 물수지를 못 만들어도 시비 카드는 막히면 안 된다."""
    titles = 제목들(밭(fertilize_needed=True))
    assert titles == ["배추 웃거름 주기"]


# ── 물: 시기 × 사정을 곱한다 ───────────────────────────────────────


def test_말랐고_관수_시기면_물_주기():
    assert "배추밭 물 주기" in 제목들(밭(water=마른날, irrigate_needed=True))


def test_말랐고_가뭄_단계여도_물_주기():
    """irrigate_needed 와 '가뭄' 은 서로 다른 신호다 — 하나만 참이어도 낸다."""
    assert "배추밭 물 주기" in 제목들(밭(water=마른날, stage_hazards=("가뭄",)))


def test_말랐어도_물이_안_중요한_시기면_카드가_없다():
    """기상만 보면 쉬는 밭에도 카드가 간다. 시기를 곱해서 막는다."""
    assert 제목들(밭(water=마른날, irrigate_needed=False, stage_hazards=("저온",))) == []


def test_관수_시기여도_안_말랐으면_카드가_없다():
    """시기만 보면 비 오는 날에도 물을 주라고 한다."""
    assert 제목들(밭(water=평범한날, irrigate_needed=True)) == []


def test_기상을_모르면_물_카드를_안_만든다():
    """judge_water 가 None 이면 근거가 없다는 뜻이다 — 틀린 근거로 조언하지 않는다."""
    assert 제목들(밭(water=WaterBalance(), irrigate_needed=True)) == []


def test_사흘_안에_비가_오면_살피기로_낮춘다():
    titles = 제목들(밭(water=비올날, irrigate_needed=True))
    assert titles == ["배추밭 물 사정 살피기"]


def test_큰비_예보에_과습_단계면_주지_말라고_한다():
    assert "배추밭 물 주지 않기" in 제목들(밭(water=큰비날, stage_hazards=("과습",)))


def test_큰비여도_과습_단계가_아니면_조용하다():
    """큰 비 하나로 모든 밭에 카드를 보내면 정작 필요한 밭의 카드가 묻힌다."""
    assert 제목들(밭(water=큰비날, irrigate_needed=True)) == []


def test_큰비가_물_주기를_덮는다():
    """2주 가물었어도 큰 비가 오면 물을 주라고 하면 안 된다 — 순서가 규칙의 일부다."""
    titles = 제목들(밭(water=큰비날, irrigate_needed=True, stage_hazards=("가뭄", "과습")))
    assert "배추밭 물 주기" not in titles
    assert "배추밭 물 주지 않기" in titles


# ── 등급 ──────────────────────────────────────────────────────────


def test_토양수분까지_마르면_등급을_올린다():
    마른흙 = WaterBalance(
        balance_14d_mm=BALANCE_DRY_MM - 10, rain_3d_mm=0.0, soil_moisture=SOIL_DRY - 0.05
    )
    (카드,) = build_task_candidates(밭(water=마른흙, irrigate_needed=True))
    assert 카드.priority == "high"


def test_토양수분을_모르면_등급을_안_올린다():
    (카드,) = build_task_candidates(밭(water=마른날, irrigate_needed=True))
    assert 카드.priority == "mid"


# ── 문장 ──────────────────────────────────────────────────────────


def test_근거가_사람_말이다():
    """★ 2026-09-19 — '증발산 -56mm' 를 농민이 읽을 말로 바꿨다."""
    비온적음 = WaterBalance(
        balance_14d_mm=BALANCE_DRY_MM - 10,
        rain_past_mm=0.1,
        rain_past_days=14,
        rain_3d_mm=0.0,
        rain_7d_mm=0.0,
    )
    (카드,) = build_task_candidates(밭(water=비온적음, irrigate_needed=True))
    assert "2주" in 카드.reason
    assert "0.1mm" in 카드.reason
    assert "비 소식이 없어요" in 카드.reason
    # 전문어를 안 쓴다
    for 금지 in ("증발산", "수지", "단계는", "입니다"):
        assert 금지 not in 카드.reason


def test_단정하는_말과_못_보는_현상을_쓰지_않는다():
    """토양수분은 모델값이고, 장마는 7일 예보로 볼 수 없다."""
    (카드,) = build_task_candidates(밭(water=마른날, irrigate_needed=True))
    for 금지 in ("장마", "말랐", "마릅니다"):
        assert 금지 not in 카드.reason


def test_예보와_관측이_비슷하면_관측을_또_적지_않는다():
    """같은 말을 두 번 하지 않는다 — 앞 문장이 이미 비가 얼마 왔는지 말했다."""
    b = WaterBalance(
        balance_14d_mm=BALANCE_DRY_MM - 10,
        rain_past_mm=0.1,
        rain_past_days=14,
        rain_3d_mm=0.0,
    )
    (카드,) = build_task_candidates(밭(water=b, irrigate_needed=True, recent_rain_mm=0.4))
    assert "관측소" not in 카드.reason


def test_예보와_관측이_어긋나면_출처를_밝힌다():
    """사용자가 '우리 동네는 비 왔는데?' 하고 의심할 수 있는 자리다."""
    b = WaterBalance(
        balance_14d_mm=BALANCE_DRY_MM - 10,
        rain_past_mm=0.1,
        rain_past_days=14,
        rain_3d_mm=0.0,
    )
    (카드,) = build_task_candidates(밭(water=b, irrigate_needed=True, recent_rain_mm=18.0))
    assert "관측소" in 카드.reason
    assert "18mm" in 카드.reason


# ── 시비 (예전 그대로 — 이 규칙은 죽어 있지 않았다) ────────────────


def test_시비는_단계_이름이_있어야_낸다():
    assert 제목들(밭(stage_name=None, fertilize_needed=True)) == []


def test_시비와_물이_같이_나올_수_있다():
    titles = 제목들(밭(water=마른날, irrigate_needed=True, fertilize_needed=True))
    assert titles == ["배추밭 물 주기", "배추 웃거름 주기"]


# ── 안전망: 기상을 못 받았을 때 ──────────────────────────────────
#
# ★ 2026-09-19 머지 — development 의 DRY_MM 규칙이 여기로 왔다.
#   평소에는 judge_water 가 판정하므로 이 경로가 돌지 않는다. 도는 때는
#   Open-Meteo 를 못 받았을 때다 — 그때도 관측소 강수는 DB 에 있다.
#   `water` 를 안 주면 빈 WaterBalance 라 judge_water 가 None 이고, 그 자리를
#   이 규칙이 받는다.


def test_기상을_못_받아도_관측이_마르면_카드가_나온다():
    assert "배추밭 물 주기" in 제목들(밭(irrigate_needed=True, recent_rain_mm=0.1))


def test_안전망_카드는_등급을_올리지_않는다():
    """ET0 도 예보도 못 본 판정이다. 물수지로 낸 것과 같은 무게로 두면 안 된다."""
    (카드,) = build_task_candidates(밭(irrigate_needed=True, recent_rain_mm=0.1))
    assert 카드.priority == "mid"


def test_안전망도_시기를_본다():
    """물이 중요하지 않은 시기에는 말라도 카드를 만들지 않는다."""
    assert 제목들(밭(irrigate_needed=False, recent_rain_mm=0.1)) == []


def test_안전망은_비가_왔으면_침묵한다():
    assert 제목들(밭(irrigate_needed=True, recent_rain_mm=30.0)) == []


def test_안전망_경계는_DRY_MM_이하다():
    assert "배추밭 물 주기" in 제목들(밭(irrigate_needed=True, recent_rain_mm=DRY_MM))
    assert 제목들(밭(irrigate_needed=True, recent_rain_mm=DRY_MM + 0.1)) == []


def test_안전망도_관측이_없으면_판정하지_않는다():
    """0mm 로 치면 비 온 날을 가뭄으로 만든다."""
    assert 제목들(밭(irrigate_needed=True, recent_rain_mm=None)) == []


def test_물수지가_있으면_안전망이_안_돈다():
    """관측이 말랐다고 해도 물수지가 '젖음'이면 카드를 내지 않는다.

    안전망이 주 판정을 이기면 예보를 본 의미가 사라진다.
    """
    젖은날 = WaterBalance(balance_14d_mm=BALANCE_DRY_MM + 50, rain_3d_mm=0.0, rain_7d_mm=0.0)
    assert 제목들(밭(water=젖은날, irrigate_needed=True, recent_rain_mm=0.1)) == []


# ── 수확: GDD 가 '때'를, 위성이 '아직 있나'를 말한다 ────────────────
#
# ★ 2026-09-19 — 하나만으로는 못 낸다. GDD 만 보면 이미 거둔 밭에도 카드가 가고,
#   위성만 보면 한창 자라는 밭더러 우거졌으니 거두라는 말이 된다.

익음 = dict(crop_name_ko="벼", sow_method="모기르기", gdd_target_passed=True, ndvi=0.79)


def test_다_익었고_아직_푸르면_살펴보라고_한다():
    assert "벼 거둘 때 살펴보기" in 제목들(밭(**익음))


def test_이미_거둔_밭에는_말하지_않는다():
    """참깨 추수 후 실측이 0.27 이었다 — 맨땅은 NDVI 가 떨어진다."""
    assert 제목들(밭(**{**익음, "ndvi": 0.27})) == []


def test_아직_때가_아니면_말하지_않는다():
    """우거졌다고 거두라고 하면 한창 자라는 밭이 잘린다."""
    assert 제목들(밭(**{**익음, "gdd_target_passed": False})) == []


def test_위성이_없으면_말하지_않는다():
    """구름에 가려 90일에 한 점도 없을 수 있다. 모름을 '있다'로 읽지 않는다."""
    assert 제목들(밭(**{**익음, "ndvi": None})) == []


def test_거둬도_남는_작물에는_말하지_않는다():
    """사과는 열매를 따도 잎이 늦가을까지 남아 NDVI 가 안 떨어진다 —
    막지 않으면 과수원에 카드가 그대로 남는다."""
    for 작물 in ("사과", "포도", "부추", "아스파라거스", "두릅"):
        assert 제목들(밭(**{**익음, "crop_name_ko": 작물, "sow_method": "씨뿌림"})) == []


def test_캐면_없어지는_작물에는_말한다():
    """마늘·생강은 다년생 여부가 아니라 **캐면 밭이 빈다**는 점이 기준이다."""
    for 작물 in ("마늘", "생강", "연근", "배추"):
        assert f"{작물} 거둘 때 살펴보기" in 제목들(
            밭(**{**익음, "crop_name_ko": 작물, "sow_method": "씨뿌림"})
        )


def test_심는_법을_모르면_말하지_않는다():
    """목록 밖 다년생(고사리·마)을 줍는 2순위 그물이다. 침묵 쪽으로 틀린다."""
    assert 제목들(밭(**{**익음, "crop_name_ko": "고사리", "sow_method": None})) == []


def test_단정하지_않는다():
    """위성은 잎을 볼 뿐 그게 우리 작물인지 모른다 — 추수 뒤 호밀도 우거져 보인다."""
    (카드,) = build_task_candidates(밭(**익음))
    assert "살펴보세요" in 카드.reason
    for 금지 in ("거두세요", "수확하세요", "NDVI"):
        assert 금지 not in 카드.reason + 카드.title


def test_수확_카드가_물_카드를_막지_않는다():
    """둘은 서로 다른 판단이다. 같이 나올 수 있어야 한다."""
    titles = 제목들(밭(**익음, water=마른날, irrigate_needed=True))
    assert "벼 거둘 때 살펴보기" in titles
    assert "벼밭 물 주기" in titles
