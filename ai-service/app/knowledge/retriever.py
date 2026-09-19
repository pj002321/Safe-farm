"""질문과 유사한 chunk를 top-k개 찾아온다."""

from collections.abc import Collection
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.domain.crop_match import find_crops
from app.domain.diversity import diversify
from app.domain.symptoms import expand_symptoms
from app.knowledge import vector_store
from app.knowledge.embedder import embed_texts
from app.knowledge.reranker import rerank
from app.models.chunk import Chunk
from app.schemas.ask import NO_MATCH_DISTANCE

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


def retrieve_with_score(
    db: Session,
    question: str,
    top_k: int = 10,
    crops: Collection[str] | None = None,
    on_date: date | None = None,
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


# 후보를 넓게 받아 소스 상한을 걸고 TOP_K 개를 고른다.
# (2026-09-17 실측 33문항: 후보 10→5 hit 24·hint 27, 후보 50→소스≤2→5 hit 29·hint 29, 잃은 문항 0).
# pipeline/doc/golden.py 의 세 값은 항상 이것과 같아야 한다 —
# 어긋나면 골든에서 좋아져도 실제 답변은 그대로다
CANDIDATES = 50   # 벡터에서 받는 후보. 정답이 22위·39위에 있었다. 20·30 은 +1 에 그친다
PER_SOURCE = 2    # 앞에 둘 같은 소스 수. 1 은 근거 둘이 한 소스에 있는 질문을 잃는다(칩 2개 사태)
TOP_K = 5


def find_matches(
    db: Session, question: str, fallback_crops: Collection[str] | None = None
) -> list[tuple[Chunk, float]]:
    """
    # summary
    질문과 관련 있는 조각을 찾아 순위까지 정리한다. retrieve_with_score 로 넓게 받고,
    diversify 로 한 소스 쏠림을 풀고, rerank 로 어휘 겹침을 반영해 정렬한 뒤,
    NO_MATCH_DISTANCE 보다 먼 것은 버린다. api/ask.py, pipeline/ask_preview.py,
    graph의 retrieve 노드가 같이 쓴다.

    # params
    db: 세션<br>
    question: 사용자 질문<br>
    fallback_crops: 질문에서 작물을 못 찾았을 때(find_crops 가 빈 집합) 대신 쓸 작물들.
        graph의 retrieve 노드가 이 밭에서 기르는 작물을 넘긴다 — "밀린 일"처럼 질문에
        작물이 없는데 필터 없이 전체를 보면 우연히 벡터가 가까운 무관한 작물 문서가
        섞여 들어온다. None 이면 예전처럼 필터 없이 전체를 본다<br>

    # returns
    (Chunk, 거리) 목록. 가까운 순, 관련 있는 것만. 하나도 없으면 빈 리스트

    # examples
        find_matches(db, "상추 발아기 물주기")  -> [(Chunk(id=7), 0.21), ...]
    """
    crops = find_crops(question, known_crops(db)) or fallback_crops
    candidates = retrieve_with_score(db, question, CANDIDATES, crops=crops)
    picked = diversify(
        candidates, key=lambda m: m[0].document.source, per_key=PER_SOURCE, limit=TOP_K
    )
    matches = rerank(question, picked)
    return [(chunk, dist) for chunk, dist in matches if dist < NO_MATCH_DISTANCE]



