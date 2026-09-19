from app.domain.task_rules import PlotTaskInputs, build_task_candidates


def test_no_candidates_when_data_missing():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name=None, water_need_mm=None, recent_rain_mm=None,
        irrigate_needed=False, fertilize_needed=False
    )
    assert build_task_candidates(inputs) == []


def test_water_candidate_when_dry_in_an_irrigation_stage():
    """단계가 '물이 중요한 시기'라 하고 기상이 '말랐다'고 할 때만 나온다."""
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name="결구기", water_need_mm=None, recent_rain_mm=0.1,
        irrigate_needed=True, fertilize_needed=False
    )
    titles = [c.title for c in build_task_candidates(inputs)]
    assert "배추밭 물 주기" in titles


def test_no_water_candidate_when_it_rained():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name="결구기", water_need_mm=None, recent_rain_mm=35.0,
        irrigate_needed=True, fertilize_needed=False
    )
    assert build_task_candidates(inputs) == []


def test_fertilize_candidate_requires_stage_name():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name=None, water_need_mm=None, recent_rain_mm=None,
        irrigate_needed=False, fertilize_needed=True
    )
    assert build_task_candidates(inputs) == []


def test_fertilize_candidate_when_needed():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name="결구기", water_need_mm=None, recent_rain_mm=None,
        irrigate_needed=False, fertilize_needed=True
    )
    titles = [c.title for c in build_task_candidates(inputs)]
    assert "배추 웃거름 주기" in titles

# ── 물 규칙이 irrigate_needed 로 바뀐 뒤 ─────────────────────────────
#
# water_need_mm 은 428행 내내 0건이라 `water_need_mm is not None` 에서 막혀
# **할 일 카드가 영영 0건**이었다(마이그레이션 20260919060000 주석).
# 그 칸은 영영 비우기로 했고, 이제 단계는 "물이 중요한 시기인가"(irrigate_needed)만
# 말하고 "지금 마른가"는 기상이 댄다.


def _inputs(**kw):
    base = dict(
        crop_name_ko="배추",
        stage_name="결구기",
        water_need_mm=None,      # 영영 None 이다
        recent_rain_mm=0.1,
        irrigate_needed=True,
        fertilize_needed=False,
    )
    base.update(kw)
    return PlotTaskInputs(**base)


def test_water_card_when_stage_needs_water_and_it_is_dry():
    titles = [c.title for c in build_task_candidates(_inputs())]
    assert "배추밭 물 주기" in titles


def test_no_water_card_when_stage_does_not_need_water():
    """물이 중요하지 않은 시기에는 말라도 카드를 만들지 않는다."""
    titles = [c.title for c in build_task_candidates(_inputs(irrigate_needed=False))]
    assert "배추밭 물 주기" not in titles


def test_no_water_card_when_it_rained_enough():
    """DRY_MM 을 넘게 왔으면 물이 중요한 시기라도 줄 이유가 없다."""
    titles = [c.title for c in build_task_candidates(_inputs(recent_rain_mm=30.0))]
    assert "배추밭 물 주기" not in titles


def test_dry_threshold_boundary():
    """경계에서 갈린다 — DRY_MM 이하가 '마름'이다."""
    from app.domain.task_rules import DRY_MM

    assert "배추밭 물 주기" in [
        c.title for c in build_task_candidates(_inputs(recent_rain_mm=DRY_MM))
    ]
    assert "배추밭 물 주기" not in [
        c.title for c in build_task_candidates(_inputs(recent_rain_mm=DRY_MM + 0.1))
    ]


def test_no_water_card_when_rain_is_unknown():
    """관측이 없으면 판정을 보류한다 — 0mm 로 치면 비 온 날을 가뭄으로 만든다."""
    titles = [c.title for c in build_task_candidates(_inputs(recent_rain_mm=None))]
    assert "배추밭 물 주기" not in titles


def test_water_need_mm_no_longer_gates_the_card():
    """옛 칸이 비어 있어도 카드가 나온다 — 이 회귀가 카드를 0건으로 만들었다."""
    titles = [c.title for c in build_task_candidates(_inputs(water_need_mm=None))]
    assert "배추밭 물 주기" in titles
