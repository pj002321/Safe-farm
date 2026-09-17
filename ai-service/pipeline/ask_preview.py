"""/ask 의 LLM 답변을 터미널에서 스트리밍으로 확인한다. 저장 없음, DB 는 검색에만 쓴다.

VS Code 작업(.vscode/tasks.json)의 "ai-service: 질문 답변 스트리밍" 으로 실행하거나
`python -m pipeline.ask_preview` 로 직접 실행.
"""

from app.core.db import new_session
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.knowledge.generator import stream_answer
from app.knowledge.reranker import rerank
from app.knowledge.retriever import retrieve_with_score
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
        matches = rerank(question, retrieve_with_score(db, question))
        found = [(chunk, dist) for chunk, dist in matches if dist < NO_MATCH_DISTANCE]
    finally:
        db.close()

    if not found:
        print("관련된 정보를 찾지 못했습니다.")
        return

    for delta in stream_answer(question, found):
        print(delta, end="", flush=True)
    print()


if __name__ == "__main__":
    main()
