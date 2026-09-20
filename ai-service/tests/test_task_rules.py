"""작업카드 판정. DB·API 없이 순수 함수만 본다.

★ 2026-09-19 — 물 규칙이 `water_need_mm` 을 떠나면서 전부 다시 썼다.
  예전 테스트는 `recent_rain_mm < water_need_mm` 을 검증했는데, 그 칸이 520행 내내
  비어 있어 **실제로는 한 번도 참이 된 적이 없는 조건**이었다.

⚠ 임계값 숫자를 여기 베끼지 않는다. water_balance 에서 가져와 그 언저리로 만든다.
"""

from app.domain.task_rules import DRY_MM, PlotTaskInputs, build_task_candidates
from app.domain.vegetation_text import NDMI_STEP, Vegetation
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

익음 = dict(
    crop_name_ko="벼",
    sow_method="모기르기",
    gdd_target_passed=True,
    vegetation=Vegetation(ndvi=0.79),
)


def test_다_익었고_아직_푸르면_살펴보라고_한다():
    assert "벼 거둘 때 살펴보기" in 제목들(밭(**익음))


def test_이미_거둔_밭에는_말하지_않는다():
    """참깨 추수 후 실측이 0.27 이었다 — 맨땅은 NDVI 가 떨어진다."""
    assert 제목들(밭(**{**익음, "vegetation": Vegetation(ndvi=0.27)})) == []


def test_아직_때가_아니면_말하지_않는다():
    """우거졌다고 거두라고 하면 한창 자라는 밭이 잘린다."""
    assert 제목들(밭(**{**익음, "gdd_target_passed": False})) == []


def test_위성이_없으면_말하지_않는다():
    """구름에 가려 90일에 한 점도 없을 수 있다. 모름을 '있다'로 읽지 않는다."""
    assert 제목들(밭(**{**익음, "vegetation": Vegetation()})) == []


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


# ── 농작업·병해충 (2026-09-19) ───────────────────────────────────
#
# stage_tasks 는 520행 중 260행이 차 있는데 **한 번도 안 읽혔다.**
# 홈에 물 카드 하나만 나가던 이유가 여기 있었다.


def test_이_단계에_하는_농사일이_카드가_된다():
    titles = 제목들(밭(stage_tasks=("지주", "피복")))
    assert "배추 지주 세우기" in titles
    assert "배추 덮어 주기" in titles


def test_농작업_카드는_등급이_낮다():
    """'지금 해야 한다' 가 아니라 '이 시기에 하는 일' 이다 — 급한 카드가 묻히면 안 된다."""
    (카드,) = build_task_candidates(밭(stage_tasks=("김매기",)))
    assert 카드.priority == "low"


def test_웃거름과_물주기는_농작업_카드로_안_낸다():
    """이미 시비 카드·물 카드가 판정한다. 또 내면 같은 말이 두 장 간다."""
    assert 제목들(밭(stage_tasks=("웃거름", "물주기"))) == []


def test_모르는_갈래는_조용히_넘어간다():
    """자료에 새 낱말이 생겨도 카드가 깨지지 않는다."""
    assert 제목들(밭(stage_tasks=("난생처음보는작업",))) == []


def test_병해충은_한_장으로_묶는다():
    """고추 9월 중순 자료가 여섯 줄이다 — 쪼개면 물 카드가 밀린다."""
    titles = 제목들(밭(crop_name_ko="고추", pest_names=("담배나방", "역병", "탄저병")))
    assert titles == ["고추 병해충 살펴보기"]


def test_병해충_문구가_지금_발생_중이라고_하지_않는다():
    """2023~2026 발생정보의 이맘때 자료다. 단정하면 거짓이 된다."""
    (카드,) = build_task_candidates(밭(crop_name_ko="고추", pest_names=("담배나방",)))
    assert "이맘때" in 카드.reason
    assert "살펴보세요" in 카드.reason
    for 금지 in ("발생했", "발생 중", "뿌리세요", "약제"):
        assert 금지 not in 카드.reason


def test_방제_시기면_병해충이_없어도_살펴보라고_한다():
    (카드,) = build_task_candidates(밭(stage_tasks=("방제",)))
    assert 카드.title == "배추 병해충 살펴보기"
    assert "방제 때" in 카드.reason


def test_방제는_농작업_카드로_따로_안_낸다():
    """병해충 카드가 이름까지 달아 대신 낸다 — 두 장이 되면 같은 일이 겹친다."""
    titles = 제목들(밭(stage_tasks=("방제",), pest_names=("담배나방",)))
    assert titles == ["배추 병해충 살펴보기"]


def test_병해충도_농작업도_없으면_조용하다():
    assert 제목들(밭(stage_tasks=(), pest_names=())) == []


def test_급한_것이_먼저_나온다():
    """홈이 위에서부터 읽힌다 — 수확·물·병해충이 농사일보다 앞이어야 한다."""
    titles = 제목들(
        밭(
            water=마른날,
            irrigate_needed=True,
            stage_tasks=("김매기",),
            pest_names=("담배나방",),
        )
    )
    assert titles.index("배추밭 물 주기") < titles.index("배추 병해충 살펴보기")
    assert titles.index("배추 병해충 살펴보기") < titles.index("배추 김매기")


# ── 재해: 기상청 특보를 할 일과 안전으로 ─────────────────────────
#
# ★ 안전 당부가 이 카드의 본론이다. 태풍에 물꼬를 보러 나갔다가, 폭염에 참고
#   일하다가 해마다 사람이 죽는다. 대비 작업은 거들 뿐이다.


def test_특보가_뜨면_미리_할_일과_안전을_말한다():
    (카드,) = build_task_candidates(밭(warnings=("호우",)))
    assert "호우 특보" in 카드.title
    assert "배수로" in 카드.reason
    assert "⚠" in 카드.reason
    assert 카드.priority == "high"


def test_재해_카드가_맨_앞이다():
    """태풍이 오는 날 물 주기 카드가 위에 있으면 안 된다."""
    titles = 제목들(밭(warnings=("태풍",), water=마른날, irrigate_needed=True))
    assert titles[0].startswith("태풍 특보")


def test_특보가_겹쳐도_한_장이다():
    """태풍 오는 날 카드 네 장을 주면 아무것도 안 읽는다."""
    titles = 제목들(밭(warnings=("태풍", "호우", "강풍")))
    assert len(titles) == 1
    assert "태풍·호우·강풍" in titles[0]


def test_바다_특보는_거른다():
    """풍랑은 밭일과 무관하다. 상관없는 카드가 뜨면 다음 경보도 안 읽는다."""
    assert 제목들(밭(warnings=("풍랑", "폭풍해일"))) == []


def test_모르는_특보에도_안전은_말한다():
    """무엇을 대비할지는 몰라도 말리는 건 할 수 있다."""
    (카드,) = build_task_candidates(밭(warnings=("황사",)))
    assert "무리하지 마세요" in 카드.reason


def test_폭염은_열사병을_경고한다():
    (카드,) = build_task_candidates(밭(warnings=("폭염",)))
    assert "한낮" in 카드.reason
    assert "그늘" in 카드.reason


def test_특보가_없으면_조용하다():
    assert 제목들(밭(warnings=())) == []


def test_받침에_따라_조사를_고른다():
    """ "바이러스이 자주 나와요" 가 나가면 나머지 내용도 못 믿는다."""
    (앞,) = build_task_candidates(밭(pest_names=("바이러스",)))
    assert "바이러스가 자주" in 앞.reason
    (뒤,) = build_task_candidates(밭(pest_names=("담배나방",)))
    assert "담배나방이 자주" in 뒤.reason


def test_특보가_겹치면_가장_위험한_쪽의_안전을_남긴다():
    """★ 들어온 순서는 위험과 상관이 없다.

    앞의 것을 그냥 쓰면 태풍+폭염 때 **열사병 경고가 조용히 빠진다.** 폭염은
    논밭에서 해마다 가장 많이 죽는 특보다.
    """
    (카드,) = build_task_candidates(밭(warnings=("태풍", "폭염")))
    assert "그늘" in 카드.reason  # 폭염 쪽 안전이 남았다
    # 대비 작업은 둘 다 적는다 — 빠지는 건 안전 문구뿐이다
    assert "비닐과 지주" in 카드.reason
    assert "차광망" in 카드.reason


# ── 기온 한계: 시기 × 한계 × 사정 ───────────────────────────────
#
# ★ crop_disaster_rules 93행이 작물 상세 화면에서만 읽히고 홈·리포트·카드
#   어디에도 안 닿고 있었다. 물 카드와 같은 구조로 꺼냈다.

추운밤 = dict(stage_hazards=("저온",), frost_limit_c=0.0, tomorrow_temp_min=-1.0)


def test_내일_아침이_한계_아래면_추위_대비를_말한다():
    (카드,) = build_task_candidates(밭(**추운밤))
    assert 카드.title == "배추 추위 대비하기"
    assert "-1도" in 카드.reason
    assert "0도부터" in 카드.reason
    assert 카드.priority == "high"


def test_한계보다_따뜻하면_조용하다():
    assert 제목들(밭(**{**추운밤, "tomorrow_temp_min": 5.0})) == []


def test_시기를_곱한다():
    """한계만 보면 한겨울 빈 밭에도 경고가 간다 — 물 카드와 같은 원칙이다."""
    assert 제목들(밭(**{**추운밤, "stage_hazards": ("가뭄",)})) == []


def test_한계를_모르면_말하지_않는다():
    """규칙이 없는 작물이 많다(93행뿐). 모름을 '안전' 으로 읽지 않는다."""
    assert 제목들(밭(**{**추운밤, "frost_limit_c": None})) == []


def test_예보를_못_받으면_말하지_않는다():
    assert 제목들(밭(**{**추운밤, "tomorrow_temp_min": None})) == []


def test_더위도_같은_구조다():
    (카드,) = build_task_candidates(
        밭(stage_hazards=("고온",), heat_limit_c=30.0, tomorrow_temp_max=33.0)
    )
    assert 카드.title == "배추 더위 대비하기"
    assert "차광망" in 카드.reason


def test_특보_카드와_따로다():
    """저쪽은 기상청이 낸 특보를 옮기고, 이쪽은 이 작물의 한계를 본다.
    특보가 없어도 이 밭에는 추울 수 있다."""
    titles = 제목들(밭(**추운밤, warnings=("한파",)))
    assert len(titles) == 2
    assert titles[0].startswith("한파 특보")
    assert titles[1] == "배추 추위 대비하기"


# ── 위성이 물 조언을 막는다 ─────────────────────────────────────
#
# ★ 물수지는 **하늘에서 온 물만** 안다. 호스로 준 물은 모른다 —
#   부지런한 분일수록 헛카드를 더 받는 꼴이다.
#
# ⚠ 틀리는 방향이 다른 규칙들과 반대다. 여기는 "모르면 카드를 낸다" 가 안전하다.

물준밭 = Vegetation(ndvi=0.72, ndmi_now=0.35, ndmi_before=0.34, gap_days=5)


def test_잎이_멀쩡하면_물_카드를_안_낸다():
    """기상은 말랐다는데 잎이 우거지고 물기도 그대로면 이미 주고 계신 밭이다."""
    assert 제목들(밭(water=마른날, irrigate_needed=True, vegetation=물준밭)) == []


def test_위성이_없으면_막지_않는다():
    """모르면 카드를 낸다 — 막았다가 진짜 가문 밭이 조용해지면 안 된다."""
    assert "배추밭 물 주기" in 제목들(밭(water=마른날, irrigate_needed=True))


def test_견줄_앞_관측이_없으면_막지_않는다():
    """관측이 하나뿐이면 물기가 준 건지 모른다(18일에 한 번이라 흔한 일이다)."""
    하나뿐 = Vegetation(ndvi=0.72, ndmi_now=0.35)
    assert "배추밭 물 주기" in 제목들(밭(water=마른날, irrigate_needed=True, vegetation=하나뿐))


def test_잎이_성기면_막지_않는다():
    """맨땅이면 볼 잎이 없다 — 위성이 물 준 것을 알 길이 없다."""
    맨땅 = Vegetation(ndvi=0.27, ndmi_now=0.1, ndmi_before=0.1)
    assert "배추밭 물 주기" in 제목들(밭(water=마른날, irrigate_needed=True, vegetation=맨땅))


def test_물기가_줄었으면_막지_않는다():
    """잎이 마르고 있으면 기상 판정이 맞다."""
    마르는중 = Vegetation(ndvi=0.72, ndmi_now=0.30, ndmi_before=0.30 + NDMI_STEP * 2)
    assert "배추밭 물 주기" in 제목들(밭(water=마른날, irrigate_needed=True, vegetation=마르는중))


def test_살피기_카드도_막는다():
    """'비 지나간 뒤 보세요' 도 이미 주고 계신 밭에는 군말이다."""
    assert 제목들(밭(water=비올날, irrigate_needed=True, vegetation=물준밭)) == []


def test_주지_말라는_말은_막지_않는다():
    """저건 '주지 마라' 라서, 이미 주고 계셔도 그대로 나가야 한다."""
    titles = 제목들(밭(water=큰비날, stage_hazards=("과습",), vegetation=물준밭))
    assert "배추밭 물 주지 않기" in titles


def test_물을_막아도_다른_카드는_나간다():
    """막는 것은 물 카드뿐이다 — 시비·병해충은 제 근거로 나간다."""
    titles = 제목들(
        밭(water=마른날, irrigate_needed=True, fertilize_needed=True, vegetation=물준밭)
    )
    assert titles == ["배추 웃거름 주기"]
