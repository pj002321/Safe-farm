from app.domain.question_trend import parse_topics


def test_counts_come_from_code_not_llm():
    data = {
        "topics": [
            {"name": "고추 탄저병", "evidence": ["Q1", "Q2", "Q2", "Q99"], "count": 50},
            {"name": "중복", "evidence": ["Q1"]},
            {"name": "토마토 물주기", "evidence": ["Q3"], "suggestion": "관수 문서 보강"},
            {"name": "", "evidence": ["Q4"]},
        ]
    }
    down = {"Q1": True, "Q2": False, "Q3": False, "Q4": True}
    out = parse_topics(data, down)
    assert [t["name"] for t in out] == ["고추 탄저병", "토마토 물주기"]
    assert out[0]["count"] == 2 and out[0]["down"] == 1
    assert out[1]["suggestion"] == "관수 문서 보강"
