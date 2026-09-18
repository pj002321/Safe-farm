"""그래프 조립. 지금 두 벌이 들어 있다.

- `build_graph_default()` — ask-flow(plan → run_tools?/retrieve → generate).
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
    ask-flow 그래프. plan 이 밭 조회(get_plot_context)가 필요한지 정하고, 필요하면
    run_tools 를 거쳐, 필요 없으면 곧장 retrieve 로 간다. retrieve 는 route 와
    무관하게 항상 돈다 — tool 경로에서도 RAG 근거를 스킵하지 않는다(plan 노드
    docstring 참고).

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
    builder.add_node("generate", generate)

    builder.add_edge(START, "plan")
    builder.add_conditional_edges(
        "plan", route_after_plan, {"run_tools": "run_tools", "retrieve": "retrieve"}
    )
    builder.add_edge("run_tools", "retrieve")
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