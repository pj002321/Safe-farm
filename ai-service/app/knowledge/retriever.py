"""질문과 유사한 chunk를 top-k개 찾아온다."""

from sqlalchemy.orm import Session
from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts

def retrieve(db: Session, question: str, top_k: int = 10) -> list:
    [query_vector] = embed_texts([question])
    return vector_store.search(db,query_vector,top_k)

