"""노드와 조건부 엣지.

- 노드는 `(state) -> dict`. state 를 고치지 않고 **바꿀 키만** 돌려주므로 하나씩 떼서 테스트된다.
- 외부 의존(기상 API · 후보 조회 · LLM)은 팩토리 인자로 주입한다. 노드 안에서 모델을 만들면
  테스트가 불가능해지고 환경변수에 묶인다.
- 점수 로직을 여기 복제하지 말 것. `rank_candidates` 는 도메인 함수를 부르기만 한다.
"""

import json
from collections.abc import Awaitable, Callable
from dataclasses import asdict

from langchain_core.language_models import BaseChatModel
from langgraph.config import get_stream_writer
from langgraph.graph import END

from app.core.config import OPENAI_MODEL
from app.domain.suitability import CropProfile, WeatherWindow, rank_crops
from app.graph.state import GraphState, RecommendationState
from app.knowledge.embedder import get_client
from app.knowledge.generator import stream_answer
from app.knowledge.retriever import find_matches
from app.knowledge.vector_store import neighbors
from app.service.ask_context import build_plot_context, plot_crop_names
from app.tools.tools import TOOL_SPECS

WeatherFetcher = Callable[[str], Awaitable[WeatherWindow]]
"""농지 id로 기상 요약을 가져오는 함수. 구현은 호스트가 주입한다."""

CandidateLoader = Callable[[], Awaitable[list[CropProfile]]]
"""평가할 작물 후보를 가져오는 함수. 구현은 호스트가 주입한다."""

AsyncNode = Callable[[RecommendationState], Awaitable[RecommendationState]]

EXPLAIN_SYSTEM_PROMPT = (
    "너는 농업 컨설턴트다. 주어진 적합도 점수와 위험 요인을 근거로, "
    "농민이 바로 행동할 수 있게 3문장 이내로 설명하라. 점수를 지어내지 마라."
)
PLAN_SYSTEM = (
    "너는 텃밭 관리 앱의 질의응답 라우터다. 질문을 보고 이 밭의 현재 상태를 "
    "조회해야 하는지 판단해 도구 호출 여부로 답하라.\n\n"
    "조회가 필요한 질문: 지금 물을 줘야 하는지, 지금 생육단계가 뭔지, "
    "요즘 날씨 기준으로 뭘 해야 하는지처럼 '지금 이 밭'을 전제로 하는 질문.\n"
    "필요 없는 질문: 병해충 증상, 재배법 일반론처럼 이 밭이 아니어도 답할 수 있는 질문.\n\n"
    "지난 대화가 있으면 같이 보고 판단하라."
)

def make_collect_weather_node(fetch_weather: WeatherFetcher) -> AsyncNode:
    """
    # summary
    기상 수집 노드를 만든다. LangGraph 노드는 인자로 state 하나만 받으므로, 실제로
    쓸 "날씨를 가져오는 방법" 을 클로저에 심어 둔다.

    # params
    fetch_weather: 농지 id 로 기상 요약을 가져오는 함수<br>

    # returns
    state 를 받아 {"weather": ...} 를 돌려주는 async 노드. 가져오기에 실패하면
    예외를 올리지 않고 {"error": ...} 를 돌려 그래프를 정상 종료시킨다

    # examples
        builder.add_node("collect_weather", make_collect_weather_node(fetch))
    """

    async def collect_weather(state: RecommendationState) -> RecommendationState:
        try:
            return {"weather": await fetch_weather(state["field_id"])}
        except Exception as cause:
            # 네트워크 경계라 여기서 잡는다. 삼키지 않고 실패 상태로 바꿔 정상 종료시킨다.
            return {"error": f"기상 데이터를 가져오지 못했습니다: {cause}"}

    return collect_weather


def make_load_candidates_node(load_candidates: CandidateLoader) -> AsyncNode:
    """
    # summary
    후보 작물 조회 노드를 만든다. state 를 읽지 않고 주입된 함수만 부른다.

    # params
    load_candidates: 평가할 작물 후보를 가져오는 함수<br>

    # returns
    state 를 받아 {"candidates": [...]} 를 돌려주는 async 노드

    # examples
        builder.add_node("load_candidates", make_load_candidates_node(loader))
    """

    async def load(_state: RecommendationState) -> RecommendationState:
        return {"candidates": await load_candidates()}

    return load


def rank_candidates(state: RecommendationState) -> RecommendationState:
    """
    # summary
    점수 계산 노드. 로직은 suitability.py 에 있고 테스트도 거기서 덮는다 —
    여기에 복제하지 않는다.

    # params
    state: weather 와 candidates 를 읽는다<br>

    # returns
    {"ranked": [...]}. weather 가 없으면 대신 {"error": ...} 를 돌려준다.
    candidates 가 비면 ranked 도 빈 리스트

    # examples
        rank_candidates({"weather": w, "candidates": [crop]})
        -> {'ranked': [SuitabilityResult(...)]}
    """
    weather = state.get("weather")
    if weather is None:
        return {"error": "기상 데이터가 없어 점수를 낼 수 없습니다."}
    return {"ranked": rank_crops(state.get("candidates", []), weather)}


def make_explain_node(llm: BaseChatModel) -> AsyncNode:
    """
    # summary
    설명 생성 노드를 만든다. 앞 노드들이 쌓아 둔 state 를 JSON 으로 정리해 프롬프트로
    던진다. 점수는 이미 나와 있고 LLM 은 말로 풀기만 한다.

    # params
    llm: 호출할 채팅 모델<br>

    # returns
    state 를 받아 {"explanation": "..."} 를 돌려주는 async 노드.
    프롬프트에는 상위 3개만 넣는다

    # examples
        builder.add_node("explain", make_explain_node(llm))
    """

    async def explain(state: RecommendationState) -> RecommendationState:
        payload = {
            "weather": asdict(state["weather"]),
            "top": [asdict(r) for r in state["ranked"][:3]],
        }
        response = await llm.ainvoke(
            [
                ("system", EXPLAIN_SYSTEM_PROMPT),
                ("user", json.dumps(payload, ensure_ascii=False)),
            ]
        )
        # content 는 블록 리스트일 수 있다. .text 는 텍스트 블록만 이어 붙인다.
        return {"explanation": response.text}

    return explain


# 조건부 엣지. 순수 함수라 테스트 가성비가 가장 높다.
def route_after_weather(state: RecommendationState) -> str:
    """
    # summary
    기상 수집 뒤 어디로 갈지 정한다. 실패했으면 뒤 단계를 돌 이유가 없다.

    # params
    state: error 와 weather 를 본다<br>

    # returns
    "load_candidates" 또는 END

    # examples
        route_after_weather({"weather": w})    -> 'load_candidates'
        route_after_weather({"error": "..."})  -> END
    """
    if state.get("error"):
        return END
    if state.get("weather") is None:
        return END
    return "load_candidates"


def route_after_rank(state: RecommendationState) -> str:
    """
    # summary
    점수 계산 뒤 어디로 갈지 정한다. 추천할 것이 없으면 LLM 을 부를 이유가 없다.

    # params
    state: error 와 ranked 를 본다<br>

    # returns
    "explain" 또는 END

    # examples
        route_after_rank({"ranked": [r]})  -> 'explain'
        route_after_rank({"ranked": []})   -> END
    """
    if state.get("error"):
        return END
    # 추천할 게 없으면 LLM 을 부를 이유가 없다.
    if not state.get("ranked"):
        return END
    return "explain"


def plan(state: GraphState) -> GraphState:
    """
    # summary
    질문을 보고 밭 상태 조회(get_plot_context)가 필요한지 LLM function-calling으로
    정한다. RAG 검색 여부는 여기서 정하지 않는다 — retrieve는 항상 돈다
    (app/graph/graph.py의 조건부 엣지 참고).

    # params
    state: question, history_context, plot_id 를 읽는다<br>

    # returns
    {"route": "tool"|"rag", "tool_calls": [...]}. plot_id 가 없으면 LLM을
    **부르지 않고** 곧장 "rag" 다 — 조회할 밭이 없어 답이 어차피 버려진다

    # examples
        plan({"question": "요즘 물 줘야해?", "plot_id": uuid(...), ...})
        -> {'route': 'tool', 'tool_calls': [...]}
    """
    # 밭이 없으면 LLM 이 조회를 원해도 결과가 "rag" 로 고정이다. 물어보고 버리는
    # 왕복이라 아예 건너뛴다 — 질문 하나에 LLM 호출이 둘에서 하나로 준다.
    # 밭을 고르지 않고 묻는 질문(첫 화면·일반 재배법)이 여기 걸린다.
    if state.get("plot_id") is None:
        return {"route": "rag", "tool_calls": []}

    messages = [{"role": "system", "content": PLAN_SYSTEM}]
    if state.get("history_context"):
        messages.append({"role": "user", "content": f"지난 대화:\n{state['history_context']}"})
    messages.append({"role": "user", "content": state["question"]})

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        tools=TOOL_SPECS,
        tool_choice="auto",
    )
    tool_calls = response.choices[0].message.tool_calls or []
    return {"route": "tool" if tool_calls else "rag", "tool_calls": tool_calls}


def run_tools(state: GraphState) -> GraphState:
    """
    # summary
    plan이 고른 도구를 실제로 실행한다. 지금은 도구가 get_plot_context 하나뿐이라
    이름 분기 없이 바로 부른다 — 도구가 늘면 tool_calls의 name으로 분기한다.

    # params
    state: db, plot_id, user_id 를 읽는다<br>

    # returns
    {"tool_result": ...}. build_plot_context 결과를 그대로 옮긴다(문자열 또는 None)

    # examples
        run_tools({"db": db, "plot_id": uuid(...), "user_id": uuid(...)})
        -> {'tool_result': '이 밭은 서울에 있고...'}
    """
    # question 을 같이 넘긴다 — 물어본 갈래(위성·병해충·재해)만 컨텍스트에 붙는다.
    # 안 넘기면 예전 그대로다(ask_context.build_plot_context 주석).
    result = build_plot_context(
        state["db"], state["plot_id"], state["user_id"], state["question"]
    )
    return {"tool_result": result}


def route_after_plan(state: GraphState) -> str:
    """
    # summary
    plan 뒤 어디로 갈지 정한다. route_after_weather와 같은 자리(순수 함수, 조건부 엣지).

    ⚠ 밭 조회가 필요 없으면 **retrieve 가 아니라 generate 로** 간다. retrieve 는
      plan 과 나란히 이미 출발해 있다(graph.build_graph_default 참고). 여기서
      retrieve 를 가리키면 같은 노드가 두 번 돈다.

    # params
    state: route 를 본다<br>

    # returns
    "run_tools" 또는 "generate"

    # examples
        route_after_plan({"route": "tool"})  -> 'run_tools'
        route_after_plan({"route": "rag"})   -> 'generate'
    """
    return "run_tools" if state.get("route") == "tool" else "generate"


def retrieve(state: GraphState) -> GraphState:
    """
    # summary
    질문과 관련된 참고 자료를 찾는다. route 와 무관하게 항상 돈다 — "tool" 로 가도
    RAG 근거를 스킵하지 않기로 했다(plan 노드 docstring 참고). 뽑힌 조각의 같은 문서
    앞뒤 조각(neighbors)을 더해 generate 용 evidence 를 따로 만든다 — 출처 칩으로
    보여줄 matches(top-k)와 LLM 에 줄 근거(evidence)의 크기가 다르기 때문이다
    ("방울토마토 물"의 정답이 뽑힌 조각의 바로 옆 조각이었다 — 골든 hint 29→31).

    plot_id 가 있으면 이 밭의 작물을 find_matches 의 fallback_crops 로 넘긴다 —
    질문에 작물 이름이 없을 때("밀린 일 알려줘") 필터 없이 전체를 보면 우연히
    벡터가 가까운 무관한 작물 문서가 섞여 들어온다(2026-09-18, '밀린 일' -> '밀'
    문서로 답한 사례).

    # params
    state: db, question, plot_id, user_id 를 읽는다<br>

    # returns
    {"matches": [...], "evidence": [...]}. matches 는 find_matches 결과 그대로,
    evidence 는 거기에 neighbors 를 더한 것

    # examples
        retrieve({"db": db, "question": "고추 물 언제 줘야 해?"})
        -> {'matches': [(Chunk(id=7), 0.21), ...], 'evidence': [...]}
    """
    plot_id = state.get("plot_id")
    fallback_crops = (
        plot_crop_names(state["db"], plot_id, state["user_id"]) if plot_id else None
    )
    matches = find_matches(state["db"], state["question"], fallback_crops=fallback_crops)
    return {"matches": matches, "evidence": matches + neighbors(state["db"], matches)}


def generate(state: GraphState) -> GraphState:
    """
    # summary
    근거를 붙여 답변 문장을 만든다. evidence 가 비어도 부른다 — 자료가 없으면
    generator.py 의 SYSTEM_PROMPT 가 일반 지식으로 답하거나 모른다고 답하게 한다.
    LangGraph 의 커스텀 스트림(get_stream_writer)으로 토큰마다 흘려보낸다 —
    graph.stream(state, stream_mode=["updates", "custom"]) 로 부르는 쪽(app/api/ask.py)이
    "custom" 채널에서 {"piece": ...}를 그대로 토큰으로 쓴다. graph.invoke() 로 부르면
    (pipeline/ask_graph_preview.py) 쓸 곳이 없어 get_stream_writer() 가 아무 것도
    안 하는 함수를 돌려준다 — 그대로 안전하다. 밭 조회 결과(tool_result)는
    plot_context 로 그대로 넘긴다.

    # params
    state: question, evidence, tool_result, history_context 를 읽는다<br>

    # returns
    {"answer": "..."} — 흘려보낸 토큰을 모두 이어붙인 전체 답변

    # examples
        generate({"question": "고추 물 언제 줘?", "evidence": [(chunk, 0.2)], ...})
        -> {'answer': '지금은...'}
    """
    write = get_stream_writer()
    pieces: list[str] = []
    for piece in stream_answer(
        state["question"], state["evidence"], state.get("tool_result"), state.get("history_context")
    ):
        pieces.append(piece)
        write({"piece": piece})
    return {"answer": "".join(pieces)}