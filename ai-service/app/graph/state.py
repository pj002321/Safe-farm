"""그래프를 흐르는 값의 정의. 노드는 **바꾼 키만** dict 로 반환한다.

- reducer 를 안 단 키는 덮어쓰기가 기본. 누적이 필요하면 `Annotated[list, operator.add]`.
- `total=False` = 아직 아무도 안 채운 키는 state 에 아예 없다 → `state.get(...)` 으로 읽는다.
- 노드 이름과 state 키는 일부러 다르게 짓는다. stream 출력에서 헷갈린다.
"""

import uuid
from typing import TypedDict

from sqlalchemy.orm import Session

from app.domain.crop_fit import CropCandidate, DailyWeather, FitResult


class GraphState(TypedDict):
    db: Session
    question: str
    user_id: uuid.UUID
    plot_id: uuid.UUID | None
    history_context: str | None   

    route: str                  # plan이 정함: "tool" | "rag"
    tool_calls: list            # plan이 고른 도구들
    tool_result: str | None     # run_tools가 만든 결과 (예: build_plot_context 결과)

    matches: list               # retrieve+rerank가 찾아온 (Chunk, 거리) 목록. 출처 칩(top-k)용
    evidence: list               # matches + 이웃 조각. generate 가 LLM 근거로 쓰는 건 이쪽
    answer: str


class RecommendationState(TypedDict, total=False):
    """텃밭 등록 중(밭 좌표만 있고 plot_id 는 아직 없다) 작물 추천용.

    `suitability.py` 의 WeatherWindow/CropProfile 대신 `crop_fit.py` 의 실제
    DB 필드 기반 타입을 쓴다 — 이상 온도·강수 범위는 DB에 없어 흉내만 내게 된다.
    """

    lat: float  # 입력. 밭 위치
    lon: float
    weather: tuple[DailyWeather, ...]  # 수집된 최근 일별 기상. collect_weather 가 채운다.
    candidates: list[CropCandidate]  # 평가 대상 작물 후보. load_candidates 가 채운다.
    ranked: list[FitResult]  # 점수 계산 결과. rank 가 채운다.
    explanation: str  # 사용자에게 보여줄 자연어 설명. explain 이 채운다.
    error: str  # 복구 불가능한 실패 사유. 있으면 그래프를 조기 종료한다.
