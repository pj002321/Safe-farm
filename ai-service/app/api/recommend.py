"""작물 추천(V1-51). 텃밭 등록 중 좌표만으로 지금 심기 좋은 작물을 매긴다.

`plot_id` 가 아직 없는 시점(등록 마법사 3단계, 작물 선택)이라 좌표만 받는다.
그래프는 collect_weather → load_candidates → rank → explain 순으로 돈다
(`app/graph/graph.py`). 점수·등급은 전부 `crop_fit.py` 가 실제 마스터 데이터로
낸 값이고, LLM(explain)은 그 값을 근거로 문장만 쓴다 — 숫자를 새로 짓지 않는다.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.graph.graph import GraphDeps, create_graph
from app.schemas.recommend import RecommendResponse
from app.service.recommend import explain_with_llm, make_candidate_loader, make_weather_fetcher

router = APIRouter(prefix="/v1/recommend", tags=["recommend"])


@router.get("", dependencies=[Depends(require_service_token)])
async def recommend(lat: float, lon: float, db: Session = Depends(get_db)) -> RecommendResponse:
    """이 좌표에서 지금 심기 좋은 작물 순위.

    기준온도(base_temp)가 없는 작물은 애초에 후보에서 빠진다(133 중 16만 남는다
    — `load_candidates` 참고). 후보가 비거나 기상 조회가 실패하면 그래프가
    `ranked: []` 로 조기 종료한다 — 그때 화면은 이 패널을 숨긴다.
    """
    deps = GraphDeps(
        fetch_weather=make_weather_fetcher(db),
        load_candidates=make_candidate_loader(db),
        llm=explain_with_llm,
    )
    result = await create_graph(deps).ainvoke({"lat": lat, "lon": lon})
    return RecommendResponse(
        ranked=[asdict(r) for r in result.get("ranked", [])],
        explanation=result.get("explanation"),
    )
