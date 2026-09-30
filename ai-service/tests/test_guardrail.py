from app.domain.guardrail import is_blocked_topic

def test_blocks_dosage_questions():
    for q in (
        "농약 희석배수 얼마나 해?",
        "희석 배수 알려줘",
        "살균제 몇 배로 타야 돼?",
        "물 20L에 살충제 몇 ml 넣어?",
        "약제 1000배로 희석하면 돼?"
    ): assert is_blocked_topic(q), q

def test_allows_normal_questions():
    for q in (
        "고추에 물 몇 L 줘야 해?",
        "탄저별 방제 시기가 언제야?",
        "비료 몇 g 줘야해?",
        "농약 안 쓰고 진딧물 잡는 법",
    ): assert not is_blocked_topic(q), q