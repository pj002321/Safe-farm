"""documents -> chunks. 대상은 조각이 하나도 없는 문서다.

load_data.py 가 바뀐 문서의 조각을 지워두므로, 그 조건 하나로 새 문서와 바뀐 문서가
모두 잡힌다. 자르는 법은 app/knowledge/chunker.py 가 안다.

앞:    python -m pipeline.doc.load_data
실행:  python -m pipeline.doc.chunk
"""

import statistics
import sys

from app.core.config import EMBED_MAX_TOKENS
from app.core.db import new_session
from app.knowledge.chunker import split_into_chunks
from app.models.document import Document


def main() -> None:
    """
    # summary
    조각이 하나도 없는 문서를 잘라 chunks 에 넣는다. load_data 가 바뀐 문서의 조각을
    지워두므로 이 조건 하나로 새 문서와 바뀐 문서가 모두 잡힌다. 벡터는 만들지 않는다.
    --rebuild 면 전부 지우고 다시 자른다 — 청킹 규칙을 바꿨을 때 쓴다.

    # params
    없다. 옵션은 argv 에서 읽는다 — --rebuild<br>

    # examples
        py -3.12 -m pipeline.doc.chunk
        py -3.12 -m pipeline.doc.chunk --rebuild
    """
    rebuild = "--rebuild" in sys.argv  # 청킹 규칙을 바꿨을 때
    db = new_session()
    try:
        if rebuild:
            documents = db.query(Document).order_by(Document.id).all()
            for doc in documents:
                doc.chunks.clear()
            db.flush()
        else:
            documents = (
                db.query(Document).filter(~Document.chunks.any()).order_by(Document.id).all()
            )

        if not documents:
            print("자를 문서가 없습니다. (전량 재청킹은 --rebuild)")
            return

        chunks = []
        for doc in documents:
            chunks.extend(split_into_chunks(doc))
        db.add_all(chunks)
        db.commit()

        tokens = [c.n_tokens for c in chunks]
        print(f"문서 {len(documents)}건 -> 조각 {len(chunks)}개")
        print(
            f"토큰 평균 {statistics.mean(tokens):.1f} "
            f"/ 중앙값 {statistics.median(tokens):.0f} / 최대 {max(tokens)}"
        )

        # 잘랐으니 걸릴 리 없다. 걸리면 뒤가 잘린 채 임베딩된다.
        over = sum(1 for n in tokens if n > EMBED_MAX_TOKENS)
        if over:
            print(f"주의: 모델 한도({EMBED_MAX_TOKENS} 토큰)를 넘는 조각 {over}개 - 뒤가 누락된다")

        print("벡터는 여기서 만들지 않습니다. 이어서 python -m pipeline.doc.embed 를 실행하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
