"""그래프 조립. 지금 두 벌이 들어 있다.

- `build_graph_default()` — ask-flow(plan ∥ retrieve → run_tools? → generate).
  모듈 끝의 `graph` 가 이것.
- `build_graph(deps)` / `create_graph(deps)` — 작물 추천. 미컴파일 쪽은 노드를 갈아끼울 때 쓴다.

외부 의존은 `GraphDeps` 로 받는다. 이 파일은 환경변수를 모른다.
checkpointer 도 여기서 만들지 않고 `create_graph(deps, checkpointer=...)` 로 받는다.
붙일 때 `serde=create_checkpoint_serde()` 를 같이 넘긴다 — 안 넘기면 state 의 dataclass 가
복원 때 조용히 dict 가 된다. state 에 새 dataclass 를 넣으면 `CHECKPOINT_TYPES` 에도 추가.
"""


from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.domain.suitability import CropProfile, Risk, SuitabilityResult, WeatherWindow
from app.graph.nodes import (
    CandidateLoader,
    WeatherFetcher,
    generate,
    make_collect_weather_node,
    make_explain_node,
    make_load_candidates_node,
    plan,
    rank_candidates,
    retrieve,
    route_after_plan,
    route_after_rank,
    route_after_weather,
    run_tools,
)
from app.graph.state import GraphState, RecommendationState


def build_graph_default() -> CompiledStateGraph:
    """
    # summary
    ask-flow 그래프. **plan 과 retrieve 가 START 에서 같이 출발한다.**

        START ┬─ plan ──(밭 조회 필요?)── run_tools ─┐
              └─ retrieve ───────────────────────────┴─ generate ─ END

    retrieve 는 plan 의 결과를 하나도 안 쓴다. 그런데 전에는 plan 뒤에 줄을 서서,
    질문 하나의 첫 글자까지 걸리는 시간에 LLM 왕복이 통째로 얹혀 있었다. 갈라
    놓으면 임베딩·벡터 검색이 plan 이 LLM 을 기다리는 동안 끝난다.

    ⚠ **`plan` 에서 DB 를 만지지 말 것.** retrieve 와 같은 슈퍼스텝에서 **정말로
      다른 스레드로** 돈다(LangGraph 가 동기 노드를 스레드 풀에 올린다). `Session`
      은 스레드 안전하지 않아서, plan 이 db 를 건드리는 순간 커서가 엉킨다.
      지금 db 를 쓰는 것은 retrieve 와 run_tools 뿐이고 이 둘은 겹치지 않는다.

    ⚠ **`generate` 의 `defer=True` 를 빼지 말 것.** 합류 노드는 들어오는 엣지를
      전부 기다려 주지 않는다 — 먼저 도착한 쪽만으로 한 번 돌고, 늦게 온 쪽 때문에
      또 돈다. 빼면 tool 경로에서 **generate 가 두 번 실행되고, 첫 번째는 밭 정보
      없이 답을 스트리밍한다.** 화면에는 답이 두 번 흐른다.
      (`tests/test_ask_graph_parallel.py` 가 두 경로의 실행 횟수를 고정한다.)

    # params
    없다<br>

    # returns
    실행 가능한 CompiledStateGraph

    # examples
        build_graph_default().invoke({"db": db, "question": "...", "user_id": ...})
    """
    builder = StateGraph(GraphState)

    builder.add_node("plan", plan)
    builder.add_node("run_tools", run_tools)
    builder.add_node("retrieve", retrieve)
    """
    START → plan     → run_tools    ↘  [gen까지 2step]
          → retrieve [gen까지 1step] →  generate(defer로 올때까지 기다리기) → END
    """
    
    builder.add_node("generate", generate, defer=True)

    """
    # 주의점
    같은 파생 노드에서 시작된 n개 노드에 대해서는 db커넥션이나 어떤 공유 객체를 r/w하면 위험함.
    START(파생 노드) -> plan / retrieve 와 같은 경우
    plan, retreive는 서로 병렬로 수행되기 때문에, 공유객체가 깨질 수 있으니 주의
    """

    builder.add_edge(START, "plan")
    builder.add_edge(START, "retrieve")

    builder.add_conditional_edges(
        "plan", route_after_plan, {"run_tools": "run_tools", "generate": "generate"}
    )
    builder.add_edge("run_tools", "generate")
    builder.add_edge("retrieve", "generate")
    builder.add_edge("generate", END)

    return builder.compile()


'''
dataclss
    frozen: const
    slots: python class는 dict형태로 멤버 가지는데, 이걸 arr방식으로 바꾸는 거
'''
@dataclass(frozen=True, slots=True)
class GraphDeps:
    fetch_weather: WeatherFetcher
    load_candidates: CandidateLoader
    llm: BaseChatModel


def build_graph(deps: GraphDeps) -> StateGraph:
    """
    # summary
    작물 추천 그래프를 조립한다. collect_weather → load_candidates → rank → explain
    선형 흐름이고, 기상 수집과 점수 계산 뒤에 조기 종료용 조건부 엣지가 하나씩 붙는다.
    컴파일하지 않은 채로 돌려주므로 노드를 갈아끼울 수 있다.

    # params
    deps: 외부 의존. 이 파일이 환경변수를 읽지 않도록 주입받는다<br>

    # returns
    미컴파일 StateGraph. 바로 실행하려면 create_graph 를 쓰거나 .compile() 을 부른다

    # examples
        build_graph(deps).compile()
    """
    builder = StateGraph(RecommendationState)

    builder.add_node("collect_weather", make_collect_weather_node(deps.fetch_weather))
    builder.add_node("load_candidates", make_load_candidates_node(deps.load_candidates))
    builder.add_node("rank", rank_candidates)
    builder.add_node("explain", make_explain_node(deps.llm))

    # START -> collect_weather 노드로 바로 간다(조건x)
    builder.add_edge(START, "collect_weather")

    # collect_weather -> load_candidates, END로 가게됨.
    # 이때, 어디로 갈지 조건은 route_after_weather()에서 리턴 됨.
    builder.add_conditional_edges(
        "collect_weather",
        route_after_weather,
        {"load_candidates": "load_candidates", END: END},
    )
    
    builder.add_edge("load_candidates", "rank")
    
    builder.add_conditional_edges("rank", route_after_rank, {"explain": "explain", END: END})

    builder.add_edge("explain", END)

    return builder


def create_graph(
    deps: GraphDeps, checkpointer: BaseCheckpointSaver | None = None
) -> CompiledStateGraph:
    """
    # summary
    build_graph 결과를 컴파일한다. checkpointer 를 붙일 때는 그것을 만들 때
    serde 로 create_checkpoint_serde() 를 같이 넘긴다.

    # params
    deps: 외부 의존<br>
    checkpointer: 멀티턴이나 중단-재개가 필요할 때만. 추천은 단발성이라 보통 None<br>

    # returns
    실행 가능한 CompiledStateGraph

    # examples
        create_graph(deps)
        create_graph(deps, checkpointer=saver)
    """
    return build_graph(deps).compile(checkpointer=checkpointer)


CHECKPOINT_TYPES: tuple[type, ...] = (WeatherWindow, CropProfile, Risk, SuitabilityResult)
"""state 에 들어가는 도메인 타입. checkpoint 복원 허용 목록."""


def create_checkpoint_serde() -> JsonPlusSerializer:
    """
    # summary
    checkpoint 복원 허용 목록을 박은 직렬화기. 안 넘기면 state 의 dataclass 가
    복원될 때 dict 가 된다. state 에 새 dataclass 를 넣으면 CHECKPOINT_TYPES 에도 추가한다.

    # params
    없다. 허용 목록은 이 모듈의 CHECKPOINT_TYPES<br>

    # returns
    JsonPlusSerializer. 허용 목록은 생성자로 넘긴다 — 기본값이 "전부 허용" 이라
    with_msgpack_allowlist() 는 무동작이다

    # examples
        saver = InMemorySaver(serde=create_checkpoint_serde())
    """
    # 기본값이 "전부 허용"이라 with_msgpack_allowlist() 는 무동작. 생성자에 직접 넘긴다.
    return JsonPlusSerializer(
        allowed_msgpack_modules=[(t.__module__, t.__name__) for t in CHECKPOINT_TYPES]
    )


graph = build_graph_default()