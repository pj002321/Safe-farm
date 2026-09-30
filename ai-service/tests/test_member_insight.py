from app.domain.member_insight import mask_pii, parse_insight


def test_mask_pii():
    assert mask_pii("010-1234-5678 a@b.com 연락") == "[전화] [이메일] 연락"


def test_parse_drops_unknown_evidence():
    data = {
        "summary": "요약",
        "segment": "이탈위험",
        "risks": [
            {"text": "할 일 방치", "evidence": ["T1", "X9"]},
            {"text": "지어낸 말", "evidence": ["Q99"]},
            {"text": "근거 없음", "evidence": []},
        ],
        "actions": [{"text": "알림", "evidence": ["P1"]}],
    }
    out = parse_insight(data, {"T1", "P1"})
    assert out["risks"] == [{"text": "할 일 방치", "evidence": ["T1"]}]
    assert out["actions"] == [{"text": "알림", "evidence": ["P1"]}]
    assert out["dropped"] == 2


def test_parse_rejects_unknown_segment():
    assert parse_insight({"segment": "VIP"}, set())["segment"] is None
