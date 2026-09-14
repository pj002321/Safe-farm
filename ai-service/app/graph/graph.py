"""그래프 조립. 지금 두 벌이 들어 있다.

- `build_graph_default()` — RAG(retrieve → generate). 모듈 끝의 `graph` 가 이것.
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
    make_collect_weather_node,
    make_explain_node,
    make_load_candidates_node,
    rank_candidates,
    route_after_rank,
    route_after_weather,
    # generate,
    # retrieve,
)
from app.graph.state import RecommendationState  # GraphState

# def build_graph_default():
#     builder = StateGraph(GraphState)

#     builder.add_node("retrieve", retrieve)
#     builder.add_node("generate", generate)

#     builder.add_edge(START, "retrieve")
#     builder.add_edge("retrieve","generate")
#     builder.add_edge("generate", END)

#     return builder.compile()


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
    return build_graph(deps).compile(checkpointer=checkpointer)


CHECKPOINT_TYPES: tuple[type, ...] = (WeatherWindow, CropProfile, Risk, SuitabilityResult)
"""state 에 들어가는 도메인 타입. checkpoint 복원 허용 목록."""


def create_checkpoint_serde() -> JsonPlusSerializer:
    # 기본값이 "전부 허용"이라 with_msgpack_allowlist() 는 무동작. 생성자에 직접 넘긴다.
    return JsonPlusSerializer(
        allowed_msgpack_modules=[(t.__module__, t.__name__) for t in CHECKPOINT_TYPES]
    )


# graph = build_graph_default()