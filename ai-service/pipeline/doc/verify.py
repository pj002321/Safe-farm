"""점검. 개수 / 벡터 차원 / 토큰 / 눈으로 검색. 아무것도 만들지 않는다.

앞:    python -m pipeline.doc.embed
실행:  python -m pipeline.doc.verify ["질문"]
"""

import sys

from sqlalchemy import func

from app.core.config import DIMENSION, EMBED_MAX_TOKENS
from app.core.db import new_session
from app.knowledge.retriever import retrieve_with_score
from app.models.chunk import Chunk
from app.models.document import Document

DEFAULT_QUERIES = ["장마철 병해충 관리", "서리 피해를 줄이는 방법"]


def banner(title: str) -> None:
    """
    # summary
    구분선과 제목을 찍는다. 점검 결과를 눈으로 훑기 좋게 나누는 용도다.

    # params
    title: 구분선 사이에 넣을 제목<br>

    # examples
        banner("1. 개수")
    """
    print()
    print("=" * 74)
    print(title)
    print("=" * 74)


def main() -> None:
    """
    # summary
    개수·벡터 차원·토큰을 보고 질의를 실제로 돌려본다. 아무것도 만들거나 고치지 않는다.
    문제를 첫 하나에서 멈추지 않고 전부 모아 끝에 찍는다.

    # params
    없다. 질문은 argv 에서 읽는다. 비우면 DEFAULT_QUERIES 를 쓴다<br>

    # examples
        py -3.12 -m pipeline.doc.verify
        py -3.12 -m pipeline.doc.verify "상추 발아기 물주기"
    """
    queries = sys.argv[1:] or DEFAULT_QUERIES
    db = new_session()
    problems: list[str] = []
    try:
        banner("1. 개수")
        n_docs = db.query(Document).count()
        n_chunks = db.query(Chunk).count()
        n_missing = db.query(Chunk).filter(Chunk.embedding.is_(None)).count()
        print(f"  documents {n_docs:,}건 / chunks {n_chunks:,}개 / 벡터 없는 조각 {n_missing:,}개")
        if not n_docs:
            problems.append("documents 가 비어 있다 (load_data 를 먼저)")
        if n_docs and not n_chunks:
            problems.append("chunks 가 비어 있다 (chunk 를 먼저)")
        if n_missing:
            problems.append(f"벡터 없는 조각 {n_missing}개 (embed 를 다시)")

        # 본문이 빈 채로 들어온 문서가 여기 잡힌다
        orphan = db.query(Document).filter(~Document.chunks.any()).count()
        if orphan:
            problems.append(f"조각이 없는 문서 {orphan}건")

        banner("2. 벡터")
        sample = db.query(Chunk).filter(Chunk.embedding.is_not(None)).first()
        if sample is None:
            problems.append("벡터가 하나도 없다")
        else:
            dim = len(sample.embedding)
            print(f"  차원 {dim} (설정값 {DIMENSION})")
            if dim != DIMENSION:
                problems.append(f"차원 불일치: DB {dim} vs 설정 {DIMENSION}")

        banner("3. 토큰")
        stats = db.query(
            func.avg(Chunk.n_tokens), func.max(Chunk.n_tokens), func.min(Chunk.n_tokens)
        ).one()
        if stats[0] is not None:
            print(f"  평균 {float(stats[0]):.1f} / 최대 {stats[1]} / 최소 {stats[2]}")
            over = db.query(Chunk).filter(Chunk.n_tokens > EMBED_MAX_TOKENS).count()
            if over:
                problems.append(f"한도({EMBED_MAX_TOKENS})를 넘는 조각 {over}개 - 뒤가 잘렸다")

        banner("4. 눈으로")
        if sample is not None:
            for question in queries:
                print(f"\n  Q. {question}")
                hits = retrieve_with_score(db, question, top_k=3)
                for rank, (chunk, distance) in enumerate(hits, 1):
                    # 코사인 거리 -> 유사도. 눈으로 볼 때는 1에 가까울수록 좋은 쪽이 읽기 편함
                    similarity = 1 - distance
                    body = chunk.body.replace("\n", " ")[:80]
                    print(
                        f"    {rank}. 유사도 {similarity:.3f} (거리 {distance:.3f}) "
                        f"[doc {chunk.document_id}] {body}..."
                    )

        banner("결과")
        if problems:
            for p in problems:
                print(f"  [문제] {p}")
        else:
            print("  이상 없음")
    finally:
        db.close()


if __name__ == "__main__":
    main()
