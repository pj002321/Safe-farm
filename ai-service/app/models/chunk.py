"""chunks 스키마. 문서를 토큰 한도 안으로 자른 한 조각."""

from pgvector.sqlalchemy import HALFVEC
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

    # float4 → float2. 저장과 HNSW 인덱스가 둘 다 절반이 된다(409MB → 약 205MB).
    # 값은 그대로라 재임베딩이 필요 없다 — 캐스팅만 하면 된다.
    # NULL = 아직 안 됨. embed.py 가 이걸로 대상을 고른다
    embedding = Column(HALFVEC(DIMENSION))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_chunks_document_index"),
        # HNSW 는 ivfflat 과 달리 빈 테이블에 미리 만들어도 된다.
        # 거리 연산자는 검색(cosine_distance)과 같아야 한다.
        # 타입을 바꿨으면 연산자 클래스도 halfvec_ 쪽으로 같이 바꾼다 —
        # vector_cosine_ops 로 두면 인덱스 생성 자체가 거부된다
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "halfvec_cosine_ops"},
        ),
    )
