from app.domain.at_risk import assess, parse_drafts


def test_assess_warning_weighs_more_when_neglected():
    assert assess(3, 0, 0, ["호우"])[0] == 1
    score, reasons = assess(20, 3, 0, ["호우"])
    assert score == 3 + 2 + 3
    assert reasons[-1] == "밭에 호우 특보 발효 중"
    assert assess(2, 0, 0, []) == (0, [])


def test_parse_drafts_drops_unknown_and_blocked():
    data = {
        "drafts": [
            {"id": "M1", "message": "호우 대비 배수로를 확인해 주세요."},
            {"id": "M9", "message": "지어낸 회원"},
            {"id": "M2", "message": "희석배수 1000배로 살포하세요."},
            {"id": "M1", "message": "중복"},
        ]
    }
    assert parse_drafts(data, {"M1", "M2"}) == {"M1": "호우 대비 배수로를 확인해 주세요."}
