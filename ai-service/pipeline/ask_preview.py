"""/ask 의 LLM 답변을 터미널에서 스트리밍으로 확인한다. 저장 없음, DB 는 검색에만 쓴다.

VS Code 작업(.vscode/tasks.json)의 "ai-service: 질문 답변 스트리밍" 으로 실행하거나
`python -m pipeline.ask_preview` 로 직접 실행.
"""

from app.api.ask import CANDIDATES, PER_SOURCE, TOP_K
from app.core.db import new_session
from app.domain.diversity import diversify
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.knowledge.generator import stream_answer
from app.knowledge.reranker import rerank
from app.knowledge.retriever import retrieve_with_score
from app.knowledge.vector_store import neighbors
from app.schemas.ask import NO_MATCH_DISTANCE


def main():
    question = input("질문: ").strip()
    if not question:
        raise SystemExit("질문을 입력하세요")

    if is_blocked_topic(question):
        print(BLOCKED_MESSAGE)
        return

    db = new_session()
    try:
        # api/ask.py 와 같은 경로여야 한다. 여기만 기본값(후보 10·상한 없음)으로 두면
        # 눈으로 보는 답이 실제 답과 달라져서 확인이 무의미해진다
        candidates = retrieve_with_score(db, question, CANDIDATES)
        picked = diversify(
            candidates, key=lambda m: m[0].document.source, per_key=PER_SOURCE, limit=TOP_K
        )
        matches = rerank(question, picked)
        found = [(chunk, dist) for chunk, dist in matches if dist < NO_MATCH_DISTANCE]
        # 출처 칩은 found 5개, LLM 근거는 이웃까지 — api/ask.py 와 같다
        evidence = found + neighbors(db, found) if found else []

        if not found:
            print("관련된 정보를 찾지 못했습니다.")
            return

        print(f"\n근거 {len(found)}개 (+이웃 {len(evidence) - len(found)}):")
        for chunk, dist in found:
            print(f"  {dist:.3f} [{chunk.document.source}] {chunk.document.title}")
        print()
        for delta in stream_answer(question, evidence):
            print(delta, end="", flush=True)
        print()
    finally:
        db.close()


if __name__ == "__main__":
    main()
