"""ask-flow 그래프의 배선. `plan` 과 `retrieve` 가 나란히 돌고, `generate` 는 한 번만.

노드 **안쪽**은 다른 테스트가 덮는다(`test_plan_skips_llm.py` 등). 여기서 고정하는
것은 `build_graph_default` 의 모양이다. 이 배선은 눈으로 봐서는 맞는지 알 수 없고,
틀리면 다음 두 가지로 고장난다:

1. `generate` 가 **두 번** 돈다. 합류 노드는 들어오는 엣지를 전부 기다려 주지
   않는다 — 먼저 도착한 `retrieve` 만으로 한 번 돌고, 늦게 온 `run_tools` 때문에
   또 돈다. 첫 번째는 밭 정보 없이 답을 스트리밍하므로 화면에 답이 두 번 흐른다.
   `generate` 의 `defer=True` 가 이걸 막는다.
2. `retrieve` 가 두 번 돈다. `route_after_plan` 이 예전처럼 "retrieve" 를 가리키면
   START 에서 한 번, plan 뒤에 또 한 번이다. 임베딩 호출이 질문마다 두 배가 된다.

둘 다 예외가 안 난다. 그래서 횟수를 센다.
"""

import threading
import uuid

import pytest

from app.graph import graph as graph_module

#: 병렬로 안 돌면 서로를 기다리다 여기서 풀린다. 넉넉히 주되 무한정은 아니다.
WAIT_SECONDS = 5

PLOT = uuid.UUID("44444444-4444-4444-4444-444444444444")
USER = uuid.UUID("55555555-5555-5555-5555-555555555555")


class _Recorder:
    """어떤 노드가 몇 번 돌았는지, 그리고 정말 겹쳐 돌았는지 기록한다."""

    def __init__(self):
        self.calls: list[str] = []
        self.generate_saw: list[tuple] = []
        self.plan_started = threading.Event()
        self.retrieve_started = threading.Event()
        self.overlapped = False


@pytest.fixture
def wired(monkeypatch):
    rec = _Recorder()

    def plan(state):
        rec.calls.append("plan")
        rec.plan_started.set()
        # retrieve 가 같은 시각에 돌고 있어야 이 기다림이 풀린다. 순서대로 돌면
        # retrieve 는 아직 시작도 안 했으므로 시간을 다 쓰고 False 로 떨어진다.
        rec.overlapped = rec.retrieve_started.wait(timeout=WAIT_SECONDS)
        # 실제 plan 과 같은 규칙 — 밭이 없으면 LLM 을 안 부르고 rag 로 고정한다.
        return {"route": "tool" if state.get("plot_id") else "rag", "tool_calls": []}

    def retrieve(state):
        rec.calls.append("retrieve")
        rec.retrieve_started.set()
        rec.plan_started.wait(timeout=WAIT_SECONDS)
        return {"matches": [("chunk", 0.1)], "evidence": [("chunk", 0.1), ("이웃", 0.3)]}

    def run_tools(state):
        rec.calls.append("run_tools")
        return {"tool_result": "이 밭은 상추를 심었고..."}

    def generate(state):
        rec.calls.append("generate")
        rec.generate_saw.append((state.get("tool_result"), state.get("evidence")))
        return {"answer": "답"}

    for name, fn in (
        ("plan", plan), ("retrieve", retrieve), ("run_tools", run_tools), ("generate", generate)
    ):
        monkeypatch.setattr(graph_module, name, fn)
    return rec


def _run(rec, plot_id):
    """조립부터 다시 한다 — 모듈 끝의 `graph` 는 import 때 이미 굳었다."""
    compiled = graph_module.build_graph_default()
    compiled.invoke(
        {"db": None, "question": "물 줘야 해?", "user_id": USER, "plot_id": plot_id}
    )
    return rec


def test_plan_and_retrieve_really_run_at_the_same_time(wired):
    """이게 이 배선의 전부다. 겹치지 않으면 갈라 놓은 뜻이 없다."""
    rec = _run(wired, plot_id=None)

    assert rec.overlapped, "plan 과 retrieve 가 차례로 돌았다"


def test_generate_runs_once_on_the_rag_path(wired):
    rec = _run(wired, plot_id=None)

    assert rec.calls.count("generate") == 1
    assert rec.calls.count("retrieve") == 1


def test_generate_runs_once_on_the_tool_path(wired):
    """defer 를 빼면 여기가 2 가 된다."""
    rec = _run(wired, plot_id=PLOT)

    assert rec.calls.count("generate") == 1, f"generate 가 여러 번 돌았다: {rec.calls}"


def test_generate_waits_for_the_plot_context(wired):
    """두 번 도는 고장의 진짜 피해 — 첫 답이 밭 정보 없이 나간다."""
    rec = _run(wired, plot_id=PLOT)

    tool_result, evidence = rec.generate_saw[0]
    assert tool_result is not None, "밭 조회 결과를 기다리지 않고 답을 만들었다"
    assert evidence, "근거를 기다리지 않고 답을 만들었다"


def test_retrieve_runs_once_even_on_the_tool_path(wired):
    """route_after_plan 이 'retrieve' 를 가리키면 여기가 2 가 된다."""
    rec = _run(wired, plot_id=PLOT)

    assert rec.calls.count("retrieve") == 1, f"retrieve 가 여러 번 돌았다: {rec.calls}"


def test_the_rag_path_does_not_touch_run_tools(wired):
    rec = _run(wired, plot_id=None)

    assert "run_tools" not in rec.calls
