"""chunks 테이블에 대한 벡터 저장/조회.
DB 접근을 이 파일 뒤로 숨겨서 다른 파일들이 SQL/pgvector 문법을 몰라도 되게 하는 게 목적"""

from sqlalchemy.orm import Session

from app.models.chunk import Chunk


def find_chunks_to_embed(db: Session) -> list[Chunk]:
    return db.query(Chunk).filter(Chunk.embedding.is_(None)).all()

def save_embeddings(db: Session, chunks: list[Chunk], vectors: list[list[float]]) -> None:
    for chunk, vector in zip(chunks, vectors, strict=True):
        chunk.embedding = vector
    db.commit()

def search(db: Session, query_vector: list[float], top_k: int = 10) -> list[Chunk]:
    """질문 벡터를 받아, chunk테이블에서 가장 근접한 k개 찾기"""
    return (
        db.query(Chunk)
        .filter(Chunk.embedding.is_not(None))
        .order_by(Chunk.embedding.cosine_distance(query_vector))
        .limit(top_k)
        .all()
    )