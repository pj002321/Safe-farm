"""작물 추천 응답 모양. `/v1/recommend` 가 돌려주는 계약이다."""

from datetime import date

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# Next 쪽 `aiService` 는 다른 엔드포인트(weather.py)와 마찬가지로 camelCase JSON 을
# 기대한다. FastAPI 는 response_model_by_alias 가 기본 True 라 별도 설정 없이도
# 이 별칭으로 직렬화된다.
_CAMEL = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RecommendationOut(BaseModel):
    """작물 하나의 판정. 점수·등급·근거는 전부 `crop_fit.score_fit` 이 낸 값 그대로다."""

    model_config = _CAMEL

    crop_id: int
    name_ko: str
    score: int
    grade: str  # good | caution | unsuitable
    in_sowing_window: bool
    risks: list[str]  # "frost" | "heat" 부분집합
    note: str  # LLM 없이도 쓸 수 있는 근거 한 줄


class RecommendResponse(BaseModel):
    model_config = _CAMEL

    ranked: list[RecommendationOut]
    # 후보가 없거나 기상 조회가 실패하면 비어 있다 — 그때 화면은 이 패널을 숨긴다
    explanation: str | None = None


class VariantQuery(BaseModel):
    """요청 바디는 다른 POST 엔드포인트(ask, diagnose)와 같이 snake_case 그대로 받는다."""

    crop_id: int
    sow_date: date | None = None  # 안 주면 오늘로 본다


class VariantRecommendRequest(BaseModel):
    lat: float
    lon: float
    crops: list[VariantQuery]


class VariantRecommendationOut(BaseModel):
    model_config = _CAMEL

    crop_id: int
    maturity_type: str  # EARLY | MID | LATE


class VariantRecommendResponse(BaseModel):
    model_config = _CAMEL

    # 판단 근거가 있는 작물만 담긴다 — 나머지는 프론트의 기존 기본값(중생 우선)에 맡긴다
    recommendations: list[VariantRecommendationOut]
