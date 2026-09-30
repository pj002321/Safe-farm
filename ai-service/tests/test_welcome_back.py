from app.domain.welcome_back import parse_greeting, should_greet


def test_should_greet():
    assert [should_greet(d) for d in (None, 6, 7, 30)] == [False, False, True, True]


def test_parse_greeting_keeps_only_grounded_safe_items():
    data = {
        "greeting": "오랜만이에요! 그동안 밭에 몇 가지 일이 있었어요.",
        "items": [
            {"text": "고추밭 물 주기가 5일째 밀려 있어요. 괜찮으신가요?", "evidence": ["T1"]},
            {"text": "지어낸 태풍 소식", "evidence": ["X9"]},
            {"text": "희석배수 1000배로 뿌려 주세요", "evidence": ["W1"]},
        ],
    }
    out = parse_greeting(data, {"T1", "W1"})
    assert out == {
        "greeting": "오랜만이에요! 그동안 밭에 몇 가지 일이 있었어요.",
        "items": [{"text": "고추밭 물 주기가 5일째 밀려 있어요. 괜찮으신가요?", "evidence": ["T1"]}],
    }


def test_parse_greeting_none_when_nothing_survives():
    assert parse_greeting({"greeting": "안녕하세요", "items": [{"text": "x", "evidence": ["Z"]}]}, {"T1"}) is None
