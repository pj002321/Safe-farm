"""골든셋 — 검색이 기대한 문서를 가져오는지 센다. 답변 문장은 보지 않는다.

    py -m pipeline.doc.golden

왜 답변을 안 보나:
    LLM 답변은 매번 다르다. 흔들리는 것을 재면 실패가 신호가 되지 못한다.
    RAG 에서 흔들리지 않는 것은 **어느 문서가 뽑혔는가** 다. 그것만 본다.

왜 pytest 가 아닌가:
    문항마다 임베딩 호출이 나간다. CI 가 돌 때마다 돈이 드는 검사는 자동화하지 않는다.
    verify.py 와 같은 자리에서 사람이 원할 때 돌린다.

읽는 파일: data/golden/ask.csv
    expect_source 가 '(tool)' 이면 SQL 로 답할 질문, '(blocked)' 면 가드레일이 막을 질문이다.
    둘 다 벡터 검색 대상이 아니라 hit 계산에서 뺀다 — 섞으면 점수가 거짓으로 낮아진다
"""

import csv
from datetime import date

from app.core.config import DATA_DIR
from app.core.db import new_session
from app.domain.guardrail import is_blocked_topic
from app.knowledge.reranker import rerank
from app.knowledge.retriever import retrieve_with_score

GOLDEN = DATA_DIR / "golden" / "ask.csv"

# api/ask.py 와 같은 경로를 잰다 — retrieve 로 후보를 받아 rerank 로 줄인다.
# 둘이 다르면 여기서 좋아져도 실제 답변은 그대로다.
#
# 값의 근거(2026-09-17 실측, 16문항):
#   retrieve  5 · 리랭커 없음 → hit 15 · hint 13
#   retrieve 10 · rerank      → hit 15 · hint 14   ← 채택
#   retrieve 20 · rerank      → hit 15 · hint 14   20 으로 늘려도 같아서 10 으로 둔다
#   retrieve 20 · 리랭커 없음  → hit 15 · hint 13   리랭커가 hint 를 하나 올린다
CANDIDATES = 10
TOP_K = 5

NOT_SEARCH = ("(tool)", "(blocked)")


def run_one(db, row: dict) -> dict:
    """
    # summary
    문항 하나를 검색에 넣고 hit·hint·거리를 잰다. 답변은 만들지 않는다.

    # params
    db: 세션<br>
    row: ask.csv 한 줄. question·expect_source·expect_hint 를 읽는다<br>

    # returns
    판정 dict. sources 는 top-5 의 소스 목록이라 왜 틀렸는지 눈으로 볼 수 있다

    # examples
        run_one(db, {'question': '...', 'expect_source': 'crop_guide', 'expect_hint': '씨앗량'})
        -> {'hit': True, 'hint': True, 'dist': 0.402, 'sources': ['crop_guide', ...]}
    """
    # ask_date 가 있으면 그날 기준으로 시기를 거른다. 같은 질문에 날짜만 다른 문항이 있어
    # (벼 5월 vs 10월) 필터가 없으면 둘 중 하나는 반드시 틀린다
    when = (row.get("ask_date") or "").strip()
    on_date = date.fromisoformat(when) if when else None
    matches = rerank(
        row["question"],
        retrieve_with_score(db, row["question"], CANDIDATES, on_date=on_date),
    )[:TOP_K]
    sources = [chunk.document.source for chunk, _ in matches]
    bodies = " ".join(chunk.body for chunk, _ in matches)
    hint = (row.get("expect_hint") or "").strip()
    return {
        "hit": row["expect_source"] in sources,
        "hint": bool(hint) and hint in bodies,
        "dist": matches[0][1] if matches else None,
        "sources": sources,
    }


def main() -> None:
    """
    # summary
    ask.csv 를 전부 돌려 hit@5 를 찍는다. (tool)·(blocked) 문항은 따로 센다.

    # params
    없다. 문항은 data/golden/ask.csv<br>

    # examples
        py -m pipeline.doc.golden
    """
    with GOLDEN.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    db = new_session()
    try:
        검색, 도구, 차단 = [], [], []
        for row in rows:
            expect = row["expect_source"]
            if expect == "(blocked)":
                차단.append((row, is_blocked_topic(row["question"])))
            elif expect == "(tool)":
                도구.append(row)
            else:
                검색.append((row, run_one(db, row)))
    finally:
        db.close()

    print(f"\n{'질문':40} {'기대':16} {'hit':5} {'hint':5} {'top1':7} 실제 top-5 소스")
    print("-" * 132)
    for row, r in 검색:
        dist = f"{r['dist']:.3f}" if r["dist"] is not None else "  -  "
        # 같은 소스가 여러 번 나오므로 순서를 지키며 접는다 — 무엇이 자리를 차지했는지 보려는 것
        본것 = ", ".join(dict.fromkeys(r["sources"]))
        print(f"{row['question'][:38]:40} {row['expect_source']:16} "
              f"{'O' if r['hit'] else 'X':5} {'O' if r['hint'] else 'X':5} {dist:7} {본것}")

    n = len(검색)
    hit = sum(1 for _, r in 검색 if r["hit"])
    hint = sum(1 for _, r in 검색 if r["hint"])
    print("-" * 132)
    print(f"  hit@{TOP_K}   {hit}/{n} ({hit * 100 // n}%)")
    print(f"  hint@{TOP_K}  {hint}/{n} ({hint * 100 // n}%)")

    # 임계값 판단 재료. hit 한 문항의 top1 거리와 miss 한 문항의 top1 거리가 갈리는지 본다 —
    # 갈리면 그 사이가 NO_MATCH_DISTANCE 다. 겹치면 임계로는 못 가르고 1.0 을 둔다
    맞은 = sorted(r["dist"] for _, r in 검색 if r["hit"] and r["dist"] is not None)
    틀린 = sorted(r["dist"] for _, r in 검색 if not r["hit"] and r["dist"] is not None)
    print("\n  top1 거리 — hit :", " ".join(f"{d:.3f}" for d in 맞은))
    print("  top1 거리 — miss:", " ".join(f"{d:.3f}" for d in 틀린))
    if 맞은 and 틀린:
        판정 = "갈린다. 사이값을 임계로" if max(맞은) < min(틀린) else "겹친다. 임계로 못 가른다"
        print(f"  hit 최대 {max(맞은):.3f} · miss 최소 {min(틀린):.3f} → {판정}")

    # 소스별로 나눠 본다. "품종은 되는데 재배법이 0" 같은 편중이 총점에 가려지지 않게
    print("\n  기대 소스별 hit")
    for name in dict.fromkeys(row["expect_source"] for row, _ in 검색):
        것들 = [r for row, r in 검색 if row["expect_source"] == name]
        print(f"    {name:18} {sum(1 for r in 것들 if r['hit'])}/{len(것들)}")

    ok = sum(1 for _, blocked in 차단 if blocked)
    print(f"\n  가드레일  {ok}/{len(차단)} 차단")
    print(f"  SQL 로 갈 질문 {len(도구)}개 — Phase 4 전까지는 검색으로 풀지 않는다")
    for row in 도구:
        print(f"    {row['question']}  -> {row['expect_hint']}")


if __name__ == "__main__":
    main()
