"""골든셋 검색 지표 — Recall@k·MRR·hint@k.

기대 소스(expect_source)가 top-k 안에 있으면 recall, 처음 나온 순위의 역수가 RR 이다.
문서 단위 정답이 없어 "기대한 **출처**가 나왔는가"로 잰다 — `pipeline/doc/golden.py` 와 같은 기준.
"""

from __future__ import annotations


def reciprocal_rank(sources: list[str], expected: str) -> float:
    return next((1 / i for i, s in enumerate(sources, 1) if s == expected), 0.0)


def summarize(results: list[dict]) -> dict:
    """results: [{"sources": [...], "expected": str, "hint": bool}] → 지표."""
    n = len(results)
    if n == 0:
        return {"n": 0, "recall": 0.0, "mrr": 0.0, "hint": 0.0}
    return {
        "n": n,
        "recall": round(sum(r["expected"] in r["sources"] for r in results) / n, 3),
        "mrr": round(sum(reciprocal_rank(r["sources"], r["expected"]) for r in results) / n, 3),
        "hint": round(sum(bool(r["hint"]) for r in results) / n, 3),
    }
