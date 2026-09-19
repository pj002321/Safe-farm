from app.domain.report_payload import parse_report_json


def test_parses_valid_json():
    result = parse_report_json({"요약": "감자가 잘 크고 있다.", "할일": ["물 주기"], "주의": []})
    assert result is not None
    assert result.summary == "감자가 잘 크고 있다."
    assert result.todos == ["물 주기"]
    assert result.cautions == []


def test_rejects_missing_summary():
    assert parse_report_json({"할일": [], "주의": []}) is None


def test_rejects_non_string_todo():
    assert parse_report_json({"요약": "요약", "할일": [1], "주의": []}) is None


def test_rejects_non_list_cautions():
    assert parse_report_json({"요약": "요약", "할일": [], "주의": "물 부족"}) is None
