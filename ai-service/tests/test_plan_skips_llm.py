"""밭을 안 고른 질문은 plan 단계에서 LLM 을 부르지 않는다.

`plan` 은 "이 밭 상태를 조회할까"를 정하는 노드다. 그런데 조회할 밭이 없으면
LLM 이 뭐라고 답하든 결과는 `rag` 로 고정이었다 — 묻고 버리는 왕복이 질문마다
하나씩 더 있었다. 첫 화면에서 밭을 고르기 전에 던지는 질문과 일반 재배법 질문이
전부 여기 해당한다.

지우는 것은 호출 한 번이 아니라 **첫 글자까지의 시간**이기도 하다. plan 은
retrieve 앞에 직렬로 있어서, 그 왕복이 끝나야 검색이 시작된다.
"""

import pytest

from app.graph import nodes


@pytest.fixture
def no_llm(monkeypatch):
    """LLM 을 부르면 그 자리에서 실패시킨다 — '안 불렀다'를 검사하는 방법이다."""

    def boom():
        raise AssertionError("plan 이 LLM 을 불렀다")

    monkeypatch.setattr(nodes, "get_client", boom)


def test_no_plot_means_no_llm_call(no_llm):
    result = nodes.plan({"question": "상추 언제 심어?", "plot_id": None})

    assert result == {"route": "rag", "tool_calls": []}


def test_missing_plot_key_is_treated_as_no_plot(no_llm):
    """plot_id 키 자체가 없는 state 도 같은 길로 간다."""
    assert nodes.plan({"question": "요즘 뭐 심어?"})["route"] == "rag"


def test_plot_question_still_asks_the_llm(monkeypatch):
    """반대쪽을 고정한다. 밭이 있으면 판단은 여전히 LLM 몫이다 —
    지금 최적화가 '항상 rag' 로 퇴화하지 않았는지 본다."""
    called = []

    class _FakeClient:
        class chat:  # noqa: N801 — OpenAI 클라이언트 모양을 그대로 흉내 낸다
            class completions:
                @staticmethod
                def create(**kwargs):
                    called.append(kwargs)
                    message = type("M", (), {"tool_calls": ["get_plot_context"]})()
                    choice = type("C", (), {"message": message})()
                    return type("R", (), {"choices": [choice]})()

    monkeypatch.setattr(nodes, "get_client", lambda: _FakeClient)

    result = nodes.plan({"question": "지금 물 줘야 해?", "plot_id": "밭-1"})

    assert called, "밭이 있는 질문인데 LLM 을 안 불렀다"
    assert result["route"] == "tool"


def test_topic_question_skips_llm_and_goes_straight_to_tool(no_llm):
    """비·태풍 같은 갈래 낱말이 걸리면 "이 밭 전제" 여부를 LLM에게 묻지 않는다.

    "태풍25호는 어디쯤 있어?" 는 PLAN_SYSTEM 의 "이 밭 전제" 기준으로는 rag 로
    빠지는데, extra_context_lines 는 이미 답을 갖고 있다 — LLM 라우터가
    topics_in 과 다르게 갈라 그 답을 버리는 사고가 실제로 있었다(2026-09-20).
    """
    result = nodes.plan({"question": "태풍25호는 어디쯤 있어?", "plot_id": "밭-1"})

    assert result == {"route": "tool", "tool_calls": []}
