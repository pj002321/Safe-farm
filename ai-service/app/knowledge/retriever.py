"""질문과 유사한 chunk를 top-k개 찾아온다."""

from collections.abc import Collection

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.domain.crop_match import find_crops
from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts
from app.models.chunk import Chunk

# 작물 이름은 마스터라 요청마다 조회할 이유가 없다. 첫 검색 때 한 번 읽고 들고 있는다.
# 마스터를 다시 시딩했으면 프로세스를 다시 띄운다 — 연 1회라 그 편이 싸다
_crop_names: set[str] | None = None


def known_crops(db: Session) -> set[str]:
    """
    # summary
    아는 작물 이름 전부. crops·crop_guides·varieties 를 합친다 — 세 곳의 목록이 다르다
    (crops 133 · crop_guides 147 · varieties 43, 합쳐서 207쯤).

    # params
    db: 세션<br>

    # returns
    작물 이름 집합. 모듈에 캐시된다

    # examples
        known_crops(db)  -> {'감자', '고추', '마늘', ...}
    """
    global _crop_names
    if _crop_names is None:
        _crop_names = {
            row[0]
            for row in db.execute(text(
                "select name from crops "
                "union select crop_name from crop_guides "
                "union select crop_name from varieties"
            ))
            if row[0]
        }
    return _crop_names


def retrieve(
    db: Session, question: str, top_k: int = 10, crops: Collection[str] | None = None
) -> list[Chunk]:
    """
    # summary
    질문을 임베딩해 가까운 조각을 찾음. 색인과 같은 embed_texts 를 쓰므로
    질의와 문서가 같은 벡터 공간에 있음.

    # params
    db: 세션<br>
    question: 사용자 질문<br>
    top_k: 가져올 개수<br>

    # returns
    가까운 순서의 Chunk 목록. 임베딩된 조각이 하나도 없으면 빈 리스트

    # examples
        retrieve(db, "상추 발아기 물주기", top_k=3)  -> [Chunk(id=7), ...]
    """
    return [chunk for chunk, _ in retrieve_with_score(db, question, top_k)]


def retrieve_with_score(
    db: Session, question: str, top_k: int = 10, crops: Collection[str] | None = None
) -> list[tuple[Chunk, float]]:
    """
    # summary
    거리까지 같이. 검색이 제대로 되는지 눈으로 보려면 거리가 있어야 함 —
    거리와 무관하게 top_k 개가 다 나오므로 결과가 나왔다고 관련 있는 게 아님.

    # params
    db: 세션<br>
    question: 사용자 질문<br>
    top_k: 가져올 개수<br>
    crops: 이 작물의 문서만 후보로 삼는다. None 이면 질문에서 찾아 쓰고,
        찾은 것이 없으면 필터 없이 전체를 본다 — "요즘 뭐 심어?" 를 막지 않으려는 것이다<br>

    # returns
    (Chunk, 코사인 거리) 를 가까운 순으로. 임베딩된 조각이 없으면 빈 리스트

    # examples
        retrieve_with_score(db, "상추 발아기 물주기", top_k=3)  -> [(Chunk(id=7), 0.21), ...]
    """
    [query_vector] = embed_texts([question])
    # 부르는 쪽이 작물을 정해 주지 않았으면 질문에서 찾는다. 못 찾으면 필터 없이 전체를 본다 —
    # "요즘 뭐 심어?" 처럼 작물이 없는 질문을 막아 버리면 안 된다
    if crops is None:
        crops = find_crops(question, known_crops(db))
    return vector_store.search_with_score(db, query_vector, top_k, crops=crops)


