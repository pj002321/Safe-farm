"""그래프를 흐르는 값의 정의. 노드는 **바꾼 키만** dict 로 반환한다.

- reducer 를 안 단 키는 덮어쓰기가 기본. 누적이 필요하면 `Annotated[list, operator.add]`.
- `total=False` = 아직 아무도 안 채운 키는 state 에 아예 없다 → `state.get(...)` 으로 읽는다.
- 노드 이름과 state 키는 일부러 다르게 짓는다. stream 출력에서 헷갈린다.
"""

import uuid
from typing import TypedDict

from sqlalchemy.orm import Session

from app.domain.suitability import CropProfile, SuitabilityResult, WeatherWindow


class GraphState(TypedDict):
    db: Session
    question: str
    user_id: uuid.UUID
    plot_id: uuid.UUID | None
    history_context: str | None   

    route: str                  # plan이 정함: "tool" | "rag"
    tool_calls: list            # plan이 고른 도구들
    tool_result: str | None     # run_tools가 만든 결과 (예: build_plot_context 결과)

    matches: list               # retrieve+rerank가 찾아온 (Chunk, 거리) 목록
    answer: str


class RecommendationState(TypedDict, total=False):
    field_id: str  # 대상 농지 id. 입력.
    weather: WeatherWindow  # 수집된 기상 요약. collect_weather 가 채운다.
    candidates: list[CropProfile]  # 평가 대상 작물 후보. load_candidates 가 채운다.
    ranked: list[SuitabilityResult]  # 점수 계산 결과. rank 가 채운다.
    explanation: str  # 사용자에게 보여줄 자연어 설명. explain 이 채운다.
    error: str  # 복구 불가능한 실패 사유. 있으면 그래프를 조기 종료한다.
