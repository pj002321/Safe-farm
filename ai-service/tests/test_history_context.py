from app.domain.history_context import (
    Turn,
    build_history_context_1,
    build_history_context_2,
)


def test_raw_keeps_question_and_answer_oldest_first():
    turns = [Turn("상추 언제 심어?", "3월 말쯤 심습니다."), Turn("물은?", "하루 한 번.")]
    assert build_history_context_1(turns) == (
        "이전 질문: 상추 언제 심어?\n"
        "이전 답변: 3월 말쯤 심습니다.\n"
        "이전 질문: 물은?\n"
        "이전 답변: 하루 한 번."
    )


def test_raw_drops_the_answer_line_when_there_is_no_answer():
    assert build_history_context_1([Turn("상추 언제 심어?", None)]) == "이전 질문: 상추 언제 심어?"


def test_raw_clips_a_long_answer():
    result = build_history_context_1([Turn("q", "가" * 300)], clip=10)
    assert result == "이전 질문: q\n이전 답변: " + "가" * 10 + "…"


def test_raw_takes_only_the_last_n_turns():
    turns = [Turn(f"q{i}", None) for i in range(5)]
    assert build_history_context_1(turns, max_turns=2) == "이전 질문: q3\n이전 질문: q4"


def test_summary_lists_questions_only():
    turns = [Turn("상추 언제 심어?", "3월 말쯤 심습니다."), Turn("물은?", "하루 한 번.")]
    assert build_history_context_2(turns) == '앞서 "상추 언제 심어?", "물은?" 를 물었다.'


def test_summary_never_leaks_a_past_answer():
    result = build_history_context_2([Turn("q", "틀린 답변")])
    assert "틀린 답변" not in result


def test_both_rules_return_none_for_no_turns():
    assert build_history_context_1([]) is None
    assert build_history_context_2([]) is None


def test_both_rules_return_none_when_max_turns_is_zero():
    turns = [Turn("q", "a")]
    assert build_history_context_1(turns, max_turns=0) is None
    assert build_history_context_2(turns, max_turns=0) is None


def test_summary_skips_blank_questions():
    assert build_history_context_2([Turn("   ", None)]) is None
