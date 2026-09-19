"""/ask 의 LLM 답변을 터미널에서 스트리밍으로 확인한다. 저장 없음, DB 는 검색에만 쓴다.

VS Code 작업(.vscode/tasks.json)의 "ai-service: 질문 답변 스트리밍" 으로 실행하거나
`python -m pipeline.ask_preview` 로 직접 실행.
"""

from app.core.db import new_session
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.knowledge.generator import stream_answer
from app.knowledge.retriever import find_matches
from app.knowledge.vector_store import neighbors


def main():
    question = input("질문: ").strip()
    if not question:
        raise SystemExit("질문을 입력하세요")

    if is_blocked_topic(question):
        print(BLOCKED_MESSAGE)
        return

    db = new_session()
    try:
        # api/ask.py 와 같은 find_matches 를 쓴다 — 눈으로 보는 답이 실제 답과 갈리면
        # 확인이 무의미해진다
        found = find_matches(db, question)
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
