"""
---------------------------------------------
[Feature]: 추천 그래프를 가짜 의존성으로 돌려 보는 연습장

[Description]
- 실행 (ai-service 디렉터리에서): `python -m examples.recommend_basic`
- 보이는 것
  1. 그래프 구조(mermaid) — https://mermaid.live 에 붙여 넣으면 그림이 된다
  2. `stream_mode="updates"` — 노드가 끝날 때마다 **그 노드가 반환한 dict** 만 나온다
  3. 실패 · 빈 후보 시나리오에서 조건부 엣지가 어디서 끊는지
- 해 볼 것
  - `fakes.fake_weather` 기온을 35로 바꿔 heat 위험과 순위 변화를 본다
  - `stream_mode="values"` 로 바꿔 매 단계 **전체 state** 가 어떻게 쌓이는지 비교한다
  - `app/graph/graph.py` 에 노드를 하나 추가해 본다 (예: 등급 unsuitable 제거 필터)
---------------------------------------------
"""

import asyncio

from app.graph.graph import GraphDeps, create_graph
from examples.fakes import broken_weather, fake_deps, no_candidates


async def run(title: str, deps: GraphDeps) -> None:
    print(f"\n=== {title} ===")
    graph = create_graph(deps)
    """
    stream_mode
        - "updates" — 바뀐 것만 (위 출력)
        - "values" — 매 단계 전체 state. 키가 누적되며 커진다
        - "messages" — LLM 토큰 단위. 진짜 타이핑 효과를 낼 때
    """

    # ainvoke() -> 마지막 결과만
    # astrem()  -> 단계 마다
    async for update in graph.astream({"lat": 37.5, "lon": 127.0}, stream_mode="updates"):
        for node, output in update.items():
            print(f"[{node}] {output}")


async def main() -> None:
    print(create_graph(fake_deps()).get_graph().draw_mermaid())

    await run("정상", fake_deps())
    await run(
        "기상 API 실패 → collect_weather 뒤에서 종료", fake_deps(fetch_weather=broken_weather)
    )
    await run(
        "후보 0개 → rank 뒤에서 종료, LLM 호출 없음", fake_deps(load_candidates=no_candidates)
    )


if __name__ == "__main__":
    asyncio.run(main())
