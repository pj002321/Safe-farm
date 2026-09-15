"""chunks.embedding 을 채운다. 대상은 embedding 이 NULL 인 조각.

그래서 기본이 증분이고, 끊겨도 남은 것부터 이어서 한다 — 돈이 드는 단계라 중요하다.

앞:    python -m pipeline.doc.chunk
실행:  python -m pipeline.doc.embed        (--full: 전량 재임베딩)
"""

import sys

from app.core.config import EMBED_BATCH_SIZE, EMBED_MODEL
from app.core.db import new_session
from app.knowledge.embedder import embed_texts
from app.knowledge.vector_store import find_chunks_to_embed, save_embeddings
from app.models.chunk import Chunk


def main() -> None:
    """
    # summary
    embedding 이 NULL 인 조각을 채운다. 그래서 기본이 증분이고, 끊겨도 남은 것부터
    이어서 한다. 배치마다 commit 하므로 같은 값에 두 번 돈을 쓰지 않는다.
    --full 이면 전부 NULL 로 지우고 다시 만든다 — 모델을 바꿨을 때만 쓴다.

    # params
    없다. 옵션은 argv 에서 읽는다 — --full<br>

    # examples
        py -3.12 -m pipeline.doc.embed
        py -3.12 -m pipeline.doc.embed --full
    """
    full = "--full" in sys.argv
    db = new_session()
    try:
        if full:
            # 모델을 바꿨을 때. 공간이 다른 옛 벡터는 섞이면 안 된다.
            db.query(Chunk).update({Chunk.embedding: None}, synchronize_session=False)
            db.commit()

        total = db.query(Chunk).filter(Chunk.embedding.is_(None)).count()
        if not total:
            print("임베딩할 조각이 없습니다. (전량 재임베딩은 --full)")
            return

        print(f"{'전량' if full else '증분'} 색인 - 모델 {EMBED_MODEL} / 대상 {total:,}개")

        done = 0
        # 묶음마다 커밋. 끊겨도 거기까지는 남아서 같은 값에 두 번 돈을 쓰지 않는다.
        while batch := find_chunks_to_embed(db, limit=EMBED_BATCH_SIZE):
            save_embeddings(db, batch, embed_texts([c.body for c in batch]))
            done += len(batch)
            print(f"  {done:,}/{total:,}")

        print("이어서 python -m pipeline.doc.verify 로 점검하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
