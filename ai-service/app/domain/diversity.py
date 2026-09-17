"""검색 후보에서 같은 소스가 top-k 를 독식하는 것을 막는다 — 버리지 않고 뒤로 민다.

weekly_note 는 같은 작물의 주차 노트가 수십 개라 벡터 상위를 싹 채운다.
"고추 물 언제 줘야 해?" 는 후보 1~21위가 전부 고추 주차 노트고 정답 crop_guide 가 22위였다.
그래서 후보를 50개 받고, 같은 소스는 앞에 per_key 개까지만 두고 나머지를 뒤로 민다.
2026-09-17 실측(33문항): 후보 10→리랭크→5 가 hit 24·hint 27, 후보 50→소스≤2→5 가 29·29.
잃은 문항 0, top-5 근거 합 165 그대로.

⚠ 버리면 안 된다. 상한 초과분을 버린 첫 판은 후보가 한 소스뿐인 질문에서 근거가 2개로 끝나
    15/33 문항이 5개 미만이 됐다. 답이 틀린 게 아니라 짧아져서 되돌렸다.
"""

from collections import Counter
from collections.abc import Callable, Iterable
from typing import TypeVar

T = TypeVar("T")


def diversify(
    items: Iterable[T], key: Callable[[T], str], per_key: int = 2, limit: int = 5
) -> list[T]:
    """
    # summary
    순서를 유지하면서 같은 key 가 per_key 개를 넘는 항목을 뒤로 보내고 limit 개까지 돌려준다.
    넘친 항목은 사라지지 않는다 — 다른 key 가 모자라면 그 자리를 다시 채운다.

    # params
    items: 거리 가까운 순으로 정렬된 후보<br>
    key: 항목에서 묶음 이름(소스)을 꺼내는 함수<br>
    per_key: 앞쪽에 둘 같은 key 의 최대 개수. 1 은 한 소스에서 근거 둘이 필요한 질문을 잃는다<br>
    limit: 돌려줄 최대 개수. items 가 그보다 적으면 있는 만큼<br>

    # returns
    앞부분은 key 별 per_key 개까지 원래 순서대로, 뒷부분은 넘친 항목이 원래 순서대로.
    길이는 min(len(items), limit). items 가 비면 빈 리스트

    # examples
        diversify(["a", "a", "a", "b"], key=str, per_key=2, limit=8)  -> ["a", "a", "b", "a"]
        diversify(["a", "a", "a"], key=str, per_key=2, limit=8)       -> ["a", "a", "a"]
    """
    kept: list[T] = []
    held: list[T] = []
    seen: Counter[str] = Counter()
    for item in items:
        k = key(item)
        if seen[k] >= per_key:
            held.append(item)
            continue
        kept.append(item)
        seen[k] += 1
    return (kept + held)[:limit]
