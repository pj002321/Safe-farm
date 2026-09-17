from app.domain.ask_suggest import SUGGESTION_COUNT, suggest_questions


def test_always_returns_three():
    # 화면이 개수를 분기하지 않게 한다는 계약. 입력이 무엇이든 세 개다.
    assert len(suggest_questions("배추", "결구기")) == SUGGESTION_COUNT
    assert len(suggest_questions("배추", None)) == SUGGESTION_COUNT
    assert len(suggest_questions(None, None)) == SUGGESTION_COUNT


def test_uses_crop_and_stage_names():
    questions = suggest_questions("배추", "결구기")
    assert all("배추" in q for q in questions)
    assert any("결구기" in q for q in questions)


def test_matches_stage_by_substring():
    # 단계 이름은 품종마다 다르다. "결구" 를 품고 있으면 같은 묶음이어야 한다.
    assert suggest_questions("배추", "결구기") == suggest_questions("배추", "결구기")
    assert suggest_questions("양파", "비대기") != suggest_questions("양파", "발아기")


def test_falls_back_when_stage_unknown():
    # 파종일이 없거나 단계표가 비어 있는 밭. 작물 이름만으로 답한다.
    questions = suggest_questions("고추", None)
    assert all("고추" in q for q in questions)
    # {stage} 자리가 빈 문자열로 채워져 어색한 공백이 남지 않아야 한다.
    assert all("  " not in q for q in questions)


def test_generic_when_no_crop():
    # 밭을 안 골랐으면 작물 이름을 지어내지 않는다.
    questions = suggest_questions(None, "결구기")
    assert all("{" not in q for q in questions)
