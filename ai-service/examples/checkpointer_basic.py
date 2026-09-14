"""
---------------------------------------------
[Feature]: checkpointer 가 무엇을 저장하는지 눈으로 보는 연습장

[Description]
- 실행 (ai-service 디렉터리에서): `python -m examples.checkpointer_basic`
- 추천 그래프는 단발성이라 운영에서는 checkpointer 없이 돈다. 여기는 **학습용**이다.
  멀티턴(`ask`)이나 interrupt 가 필요해질 때 무엇이 달라지는지 미리 본다.
- `InMemorySaver` 는 프로세스 메모리라 재시작하면 사라진다. 운영 저장소 선택은 별개 문제다.
- 보이는 것
  1. checkpointer 없이 상태 조회 → ValueError
  2. 한 번 실행하면 thread_id 아래에 단계별 스냅샷이 쌓인다
  3. thread_id 가 다르면 상태가 섞이지 않는다
- 해 볼 것
  - `serde=create_checkpoint_serde()` 를 지우고 실행 → "Deserializing unregistered type" 경고 확인
---------------------------------------------
"""

import asyncio

from langgraph.checkpoint.memory import InMemorySaver

from app.graph.graph import create_checkpoint_serde, create_graph
from examples.fakes import fake_deps


async def main() -> None:
    config = {"configurable": {"thread_id": "field-1"}}

    print("=== 1. checkpointer 없음 ===")
    stateless = create_graph(fake_deps())
    await stateless.ainvoke({"field_id": "field-1"}, config)
    try:
        await stateless.aget_state(config)
    except ValueError as e:
        print("aget_state →", e) # 체크 포인터 없는 걸 보는 셉

    print("\n=== 2. InMemorySaver ===")
    graph = create_graph(fake_deps(), checkpointer=InMemorySaver(serde=create_checkpoint_serde()))
    await graph.ainvoke({"field_id": "field-1"}, config)

    snapshot = await graph.aget_state(config)
    print("마지막 state 키:", sorted(snapshot.values))
    print("다음에 실행될 노드:", snapshot.next, "(비어 있으면 끝까지 돈 것)")

    print("\n단계별 스냅샷 (최신 → 과거):")
    async for step in graph.aget_state_history(config):
        print(f"  step={step.metadata['step']:>2}  next={step.next}  keys={sorted(step.values)}")

    print("\n=== 3. 다른 thread_id ===")
    other = await graph.aget_state({"configurable": {"thread_id": "field-2"}})
    print("field-2 state:", other.values, "(비어 있음)")


if __name__ == "__main__":
    asyncio.run(main())
