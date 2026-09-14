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
    """TODO: pgvector의 거리 연산 메서드 사용
    Chunk.embedding.cosine_distance(querty_vector)로 정렬 후 k산출"""
    raise NotImplementedError