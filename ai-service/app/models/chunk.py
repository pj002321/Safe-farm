"""chunks 스키마. 문서를 토큰 한도 안으로 자른 한 조각."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.core.config import DIMENSION
from app.core.db import Base


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True)
    document_id = Column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index = Column(Integer, nullable=False)  # 문서 안에서 몇 번째 조각인가

    body = Column(Text, nullable=False)
    n_tokens = Column(Integer, nullable=False)

    embedding = Column(Vector(DIMENSION))  # NULL = 아직 안 됨. embed.py 가 이걸로 대상을 고른다

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_chunks_document_index"),
        # HNSW 는 ivfflat 과 달리 빈 테이블에 미리 만들어도 된다.
        # 거리 연산자는 검색(cosine_distance)과 같아야 한다.
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )
