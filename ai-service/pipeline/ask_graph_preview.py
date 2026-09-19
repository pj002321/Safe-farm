"""app/graph/graph.py 의 ask-flow 그래프를 실제 DB로 한 번 돌려본다. 저장 없음.

`python -m pipeline.ask_graph_preview` 로 직접 실행.
"""

import uuid

from app.core.db import new_session
from app.graph.graph import graph


def main():
    question = input("질문: ").strip()
    if not question:
        raise SystemExit("질문을 입력하세요")

    user_id = uuid.UUID(input("user_id (uuid): ").strip())
    plot_id_raw = input("plot_id (uuid, 없으면 엔터): ").strip()
    plot_id = uuid.UUID(plot_id_raw) if plot_id_raw else None

    db = new_session()
    try:
        result = graph.invoke(
            {
                "db": db,
                "question": question,
                "user_id": user_id,
                "plot_id": plot_id,
                "history_context": None,
            }
        )
        print(f"\nroute: {result.get('route')}")
        print(f"matches: {len(result.get('matches', []))}개")
        print(f"\n답변:\n{result.get('answer')}")
    finally:
        db.close()


if __name__ == "__main__":
    main()