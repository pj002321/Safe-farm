"""질문과 유사한 chunk를 top-k개 찾아온다."""

from collections.abc import Collection
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.domain.crop_match import find_crops
from app.domain.symptoms import expand_symptoms
from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts
from app.models.chunk import Chunk

# 작물 이름은 마스터라 요청마다 조회할 이유가 없다. 첫 검색 때 한 번 읽고 들고 있는다.
# 마스터를 다시 시딩했으면 프로세스를 다시 띄운다 — 연 1회라 그 편이 싸다
_crop_names: set[str] | None = None

def retrieve_with_score(db: Session, question: str, top_k: int = 10) -> list[tuple[Chunk, float]]:
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
    on_date: 이 날짜(연도 무시, 월·일만)를 기간에 포함하는 시기 문서만 후보로 삼는다.
        vector_store.search_with_score 로 그대로 흘린다. None 이면 시기 필터 없음<br>

    # returns
    (Chunk, 코사인 거리) 를 가까운 순으로. 임베딩된 조각이 없으면 빈 리스트

    # examples
        retrieve_with_score(db, "상추 발아기 물주기", top_k=3)  -> [(Chunk(id=7), 0.21), ...]
    """
    # 증상말(반점·녹는다·시든다)을 문서의 말(노균병·무름병·시들음병)로 넓혀 임베딩한다.
    # 원문 question 은 그대로 LLM 으로 간다 — 여기서 바뀌는 건 검색 벡터만이다
    [query_vector] = embed_texts([expand_symptoms(question)])
    # 부르는 쪽이 작물을 정해 주지 않았으면 질문에서 찾는다. 못 찾으면 필터 없이 전체를 본다 —
    # "요즘 뭐 심어?" 처럼 작물이 없는 질문을 막아 버리면 안 된다
    if crops is None:
        crops = find_crops(question, known_crops(db))
    return vector_store.search_with_score(db, query_vector, top_k, crops=crops, on_date=on_date)



