from sqlalchemy import Column, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base


class Document(Base):
    """CSV 한 줄을 통째로 담아두는 역할"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    source = Column(String, nullable=False)
    external_id = Column(String, nullable=False)
    title = Column(String)
    content = Column(Text, nullable=False)
    meta = Column(JSON)
    content_hash = Column(String, nullable=False)

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")