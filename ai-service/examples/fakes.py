"""
---------------------------------------------
[Feature]: 도메인이 정해지기 전까지 쓰는 가짜 의존성

[Description]
- `GraphDeps` 에 넣을 가짜 구현 모음. 작물 기준값은 **농업적 사실이 아니라 임의 값**이다.
- 실제 기상 API · 후보 테이블이 정해지면 같은 시그니처로 진짜 구현을 `app/` 에 만들고,
  이 파일은 실험용으로 남긴다. 그래프 코드는 바뀌지 않는다.
- LLM 은 `FakeListChatModel` — API 키 없이, 비용 없이 그래프 흐름만 본다.

[Usage]
```python
fake_deps()                                  # 전부 정상
fake_deps(fetch_weather=broken_weather)      # 하나만 바꿔 실패 시나리오
```
---------------------------------------------
"""

from dataclasses import replace
from typing import Any

from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.domain.suitability import CropProfile, WeatherWindow
from app.graph.graph import GraphDeps

TOMATO = CropProfile("tomato", "토마토", (18, 27), (40, 120), 6)
RICE = CropProfile("rice", "벼", (20, 30), (150, 400), 5)
LETTUCE = CropProfile("lettuce", "상추", (15, 20), (50, 100), 4)


async def fake_weather(_field_id: str) -> WeatherWindow:
    return WeatherWindow(avg_temp_c=22, rainfall_mm=80, sunshine_hours=8)


async def broken_weather(_field_id: str) -> WeatherWindow:
    raise TimeoutError("기상 API 응답 없음")


async def fake_candidates() -> list[CropProfile]:
    return [TOMATO, RICE, LETTUCE]


async def no_candidates() -> list[CropProfile]:
    return []


def fake_llm() -> FakeListChatModel:
    return FakeListChatModel(responses=["(가짜 LLM 응답) 토마토가 가장 적합합니다."])


def fake_deps(**overrides: Any) -> GraphDeps:
    """기본은 전부 정상 동작. 바꾸고 싶은 의존성만 키워드로 넘긴다."""
    return replace(GraphDeps(fake_weather, fake_candidates, fake_llm()), **overrides)
