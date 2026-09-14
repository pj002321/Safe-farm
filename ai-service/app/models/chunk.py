"""청크가 뭔지 (테이블 스키마: 컬럼,타입)"""


from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.core.config import DIMENSION
from app.core.db import Base


class Chunk(Base):
    """Document가 쪼개진 조각 하나를, 나중에 벡터 하나로 바뀌어서 검색당할 수 있게함."""
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    body = Column(Text, nullable=False)
    n_tokens = Column(Integer, nullable=False)
    embedding = Column(Vector(DIMENSION))

    document = relationship("Document", back_populates="chunks")