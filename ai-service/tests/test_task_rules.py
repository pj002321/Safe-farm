from app.domain.task_rules import PlotTaskInputs, build_task_candidates


def test_no_candidates_when_data_missing():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name=None, water_need_mm=None, recent_rain_mm=None, fertilize_needed=False
    )
    assert build_task_candidates(inputs) == []


def test_water_candidate_when_rain_below_need():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name="결구기", water_need_mm=30.0, recent_rain_mm=0.1, fertilize_needed=False
    )
    titles = [c.title for c in build_task_candidates(inputs)]
    assert "배추밭 물 주기" in titles


def test_no_water_candidate_when_rain_meets_need():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name="결구기", water_need_mm=30.0, recent_rain_mm=35.0, fertilize_needed=False
    )
    assert build_task_candidates(inputs) == []


def test_fertilize_candidate_requires_stage_name():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name=None, water_need_mm=None, recent_rain_mm=None, fertilize_needed=True
    )
    assert build_task_candidates(inputs) == []


def test_fertilize_candidate_when_needed():
    inputs = PlotTaskInputs(
        crop_name_ko="배추", stage_name="활착기", water_need_mm=None, recent_rain_mm=None, fertilize_needed=True
    )
    titles = [c.title for c in build_task_candidates(inputs)]
    assert "배추 웃거름 주기" in titles
