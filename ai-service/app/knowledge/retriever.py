"""질문과 유사한 chunk를 top-k개 찾아온다."""

from sqlalchemy.orm import Session

from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts
from app.models.chunk import Chunk


def retrieve_with_score(db: Session, question: str, top_k: int = 10) -> list[tuple[Chunk, float]]:
    """
    # summary
    거리까지 같이. 검색이 제대로 되는지 눈으로 보려면 거리가 있어야 함 —
    거리와 무관하게 top_k 개가 다 나오므로 결과가 나왔다고 관련 있는 게 아님.

    # params
    db: 세션<br>
    question: 사용자 질문<br>
    top_k: 가져올 개수<br>

    # returns
    (Chunk, 코사인 거리) 를 가까운 순으로. 임베딩된 조각이 없으면 빈 리스트

    # examples
        retrieve_with_score(db, "상추 발아기 물주기", top_k=3)  -> [(Chunk(id=7), 0.21), ...]
    """
    [query_vector] = embed_texts([question])
    return vector_store.search_with_score(db, query_vector, top_k)

