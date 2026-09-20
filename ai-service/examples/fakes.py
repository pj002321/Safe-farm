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

from app.domain.crop_fit import CropCandidate, DailyWeather, HazardRule, SowWindow
from app.graph.graph import GraphDeps

TOMATO = CropCandidate(1, "토마토", 8.0, 30.0, (SowWindow("04-01", "05-31"),), ())
RICE = CropCandidate(2, "벼", 10.0, 30.0, (SowWindow("05-11", "06-15"),), ())
LETTUCE = CropCandidate(
    3, "상추", 5.0, 25.0, (SowWindow("03-01", "04-30"),),
    (HazardRule("frost", "", "ta_min", "lte", 2.0),),
)

_WEEK = tuple(DailyWeather(f"2026-04-{10 + i:02d}", 22.0, 12.0) for i in range(7))


async def fake_weather(_lat: float, _lon: float) -> tuple[DailyWeather, ...]:
    return _WEEK


async def broken_weather(_lat: float, _lon: float) -> tuple[DailyWeather, ...]:
    raise TimeoutError("기상 API 응답 없음")


async def fake_candidates() -> list[CropCandidate]:
    return [TOMATO, RICE, LETTUCE]


async def no_candidates() -> list[CropCandidate]:
    return []


async def fake_llm(_messages: list[dict]) -> str:
    return "(가짜 LLM 응답) 토마토가 가장 적합합니다."


def fake_deps(**overrides: Any) -> GraphDeps:
    """기본은 전부 정상 동작. 바꾸고 싶은 의존성만 키워드로 넘긴다."""
    return replace(GraphDeps(fake_weather, fake_candidates, fake_llm), **overrides)
