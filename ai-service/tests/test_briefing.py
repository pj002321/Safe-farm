from app.domain.briefing import Metric, metrics_block, parse_briefing

METRICS = [Metric("K1", "AI 질문", 30, 20), Metric("K2", "신규 가입", 2, 0)]


def test_metrics_block_shows_change():
    assert metrics_block(METRICS) == (
        "[K1] AI 질문: 이번 주 30, 지난주 20 (+10, +50%)\n"
        "[K2] 신규 가입: 이번 주 2, 지난주 0 (+2)"
    )


def test_parse_drops_invented_numbers_and_ids():
    data = {
        "points": [
            {"text": "질문이 50% 늘어 30건입니다.", "evidence": ["K1"]},
            {"text": "질문이 1,000건을 넘었습니다.", "evidence": ["K1"]},
            {"text": "가입 2명", "evidence": ["K9"]},
            {"text": "최근 7일 가입 2명", "evidence": ["K2"]},
        ]
    }
    kept, dropped = parse_briefing(data, METRICS)
    assert [p["text"] for p in kept] == ["질문이 50% 늘어 30건입니다.", "최근 7일 가입 2명"]
    assert dropped == 2
