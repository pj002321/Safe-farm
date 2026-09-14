"""질문과 유사한 chunk를 top-k개 찾아온다."""

from sqlalchemy.orm import Session

from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts


def retrieve(db: Session, question: str, top_k: int = 10) -> list:
    """
    # summary
    질문을 임베딩해 가까운 조각을 찾는다. 색인과 같은 embed_texts 를 쓰므로
    질의와 문서가 같은 벡터 공간에 있다.

    # params
    db: 세션<br>
    question: 사용자 질문<br>
    top_k: 가져올 개수<br>

    # returns
    가까운 순서의 Chunk 목록. 아직 임베딩된 조각이 하나도 없으면 빈 리스트

    # examples
        retrieve(db, "상추 발아기 물주기", top_k=3)  -> [Chunk(id=7), ...]
    """
    [query_vector] = embed_texts([question])
    return vector_store.search(db,query_vector,top_k)

