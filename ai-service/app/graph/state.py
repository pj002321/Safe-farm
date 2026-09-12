from typing import TypedDict

from sqlalchemy.orm import Session
from app.models.chunk import Chunk

class GraphState(TypedDict):
    db: Session
    question: str
    documents: list[Chunk]
    answer: str

