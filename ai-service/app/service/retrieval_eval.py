"""골든셋으로 검색 품질을 재고, 검색 단계를 하나씩 더한 세 군을 비교한다.

세 군은 **같은 질의 벡터**를 쓴다 — 문항마다 임베딩을 한 번만 부르고 뒤처리만 바꾼다.
그래서 군 사이 차이는 순수하게 뒤처리(후보 확장·소스 상한·리랭크)의 효과다.

    A  벡터만          상위 5개 그대로
    B  + 후보 확장     후보 50개 → 소스당 2개 밀어내기 → 5개
    C  + 리랭크        B 를 어휘 겹침으로 재정렬 (= 운영 중인 find_matches 와 같은 경로)

비용: 검색 문항 수만큼 임베딩 호출(문항당 1회). LLM 은 부르지 않는다.
판정 기준은 `pipeline/doc/golden.py` 와 같다 — 둘이 다르면 화면과 콘솔이 다른 말을 한다.
"""

from __future__ import annotations

import csv
from datetime import date

from sqlalchemy.orm import Session

from app.domain.crop_match import find_crops
from app.domain.diversity import diversify
from app.domain.retrieval_eval import reciprocal_rank, summarize
from app.domain.symptoms import expand_symptoms
from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts
from app.knowledge.reranker import rerank
from app.knowledge.retriever import CANDIDATES, PER_SOURCE, TOP_K, known_crops
from app.knowledge.vector_store import neighbors
from pipeline.doc.golden import GOLDEN, NOT_SEARCH

ARMS = (
    ("A", "벡터만"),
    ("B", "+ 후보 확장·소스 상한"),
    ("C", "+ 리랭크 (운영)"),
)


def _arms(db: Session, question: str, vector: list[float], crops, on_date) -> dict[str, list]:
    candidates = vector_store.search_with_score(db, vector, CANDIDATES, crops=crops, on_date=on_date)
    picked = diversify(candidates, key=lambda m: m[0].document.source, per_key=PER_SOURCE, limit=TOP_K)
    return {"A": candidates[:TOP_K], "B": picked, "C": rerank(question, picked)}


def evaluate(db: Session) -> dict:
    with GOLDEN.open(encoding="utf-8-sig", newline="") as fh:
        rows = [r for r in csv.DictReader(fh) if r["expect_source"] not in NOT_SEARCH]

    vectors = embed_texts([expand_symptoms(r["question"]) for r in rows])
    crops_known = known_crops(db)
    per_arm: dict[str, list[dict]] = {key: [] for key, _ in ARMS}
    questions = []
    for row, vector in zip(rows, vectors, strict=True):
        when = (row.get("ask_date") or "").strip()
        on_date = date.fromisoformat(when) if when else None
        crops = find_crops(row["question"], crops_known)
        hint = (row.get("expect_hint") or "").strip()
        detail = {"question": row["question"], "expected": row["expect_source"]}
        for key, matches in _arms(db, row["question"], vector, crops, on_date).items():
            sources = [chunk.document.source for chunk, _ in matches]
            bodies = " ".join(chunk.body for chunk, _ in matches + neighbors(db, matches))
            per_arm[key].append({
                "sources": sources,
                "expected": row["expect_source"],
                "hint": bool(hint) and hint in bodies,
            })
            detail[key] = reciprocal_rank(sources, row["expect_source"])
        questions.append(detail)

    return {
        "k": TOP_K,
        "arms": [{"key": key, "label": label, **summarize(per_arm[key])} for key, label in ARMS],
        # 운영(C) 기준으로 놓친 문항이 위로 — 무엇을 고쳐야 하는지가 여기서 보인다
        "questions": sorted(questions, key=lambda q: q["C"]),
    }
