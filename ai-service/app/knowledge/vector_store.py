"""chunks 벡터 저장/조회. pgvector 문법을 아는 곳을 여기 하나로 묶는다."""

from collections.abc import Collection

from sqlalchemy.orm import Session, joinedload

from app.models.chunk import Chunk
from app.models.document import Document


def find_chunks_to_embed(db: Session, limit: int | None = None) -> list[Chunk]:
    """
    # summary
    아직 벡터가 없는 조각. 이게 증분 색인의 기준이다.

    # params
    db: 세션<br>
    limit: 한 번에 가져올 개수. None 이면 전부<br>

    # returns
    id 오름차순 조각 목록. 남은 것이 없으면 빈 리스트라 배치 루프의 종료 조건이 된다

    # examples
        find_chunks_to_embed(db, limit=100)  -> [Chunk(id=1), Chunk(id=2), ...]
    """
    query = db.query(Chunk).filter(Chunk.embedding.is_(None)).order_by(Chunk.id)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


def save_embeddings(db: Session, chunks: list[Chunk], vectors: list[list[float]]) -> None:
    """
    # summary
    조각과 벡터를 짝지어 채우고 commit 한다. 배치마다 부르면 중간에 끊겨도 거기까지는
    남아서 같은 값에 두 번 돈을 쓰지 않는다. 개수가 어긋나면 ValueError 로 멈춘다.

    # params
    db: 세션<br>
    chunks: 채울 조각들<br>
    vectors: chunks 와 같은 순서·같은 길이의 벡터<br>

    # examples
        save_embeddings(db, batch, embed_texts([c.body for c in batch]))
    """
    # strict 없이는 개수가 어긋날 때 zip 이 조용히 자른다 = 엉뚱한 조각에 엉뚱한 벡터
    for chunk, vector in zip(chunks, vectors, strict=True):
        chunk.embedding = vector
    db.commit()


def search(db: Session, query_vector: list[float], top_k: int = 10) -> list[Chunk]:
    """
    # summary
    질의 벡터와 가까운 조각 top-k. 거리 값이 필요하면 search_with_score 를 씀.

    # params
    db: 세션<br>
    query_vector: 질의 임베딩<br>
    top_k: 가져올 개수<br>

    # returns
    가까운 순서의 조각 목록. embedding 이 NULL 인 조각은 빠짐

    # examples
        search(db, vector, top_k=3)  -> [Chunk(id=7), Chunk(id=2), Chunk(id=9)]
    """
    return [chunk for chunk, _ in search_with_score(db, query_vector, top_k)]


def search_with_score(
    db: Session,
    query_vector: list[float],
    top_k: int = 10,
    crops: Collection[str] | None = None,
) -> list[tuple[Chunk, float]]:
    """
    # summary
    거리까지 같이. 실제 쿼리는 여기 한 곳뿐이고 search 는 이걸 감싼 것임 —
    두 벌로 두면 필터·정렬 조건이 갈림.
    거리 연산(cosine)은 색인한 HNSW 와 맞춤. 어긋나면 인덱스를 못 타고 전수 비교가 됨.<br>
    **질문 벡터를 받아, chunk테이블에서 가장 근접한 k개 찾기**

    # params
    db: 세션<br>
    query_vector: 질의 임베딩<br>
    top_k: 가져올 개수<br>
    crops: 이 작물의 문서만 후보로 삼는다. 비거나 None 이면 전체.
        meta 에 '작물' 이 없는 문서(옛 색인)는 걸러지지 않고 남는다 — 필터가 후보를 줄일 뿐
        없는 작물을 지어내지는 않기 때문이다<br>

    # returns
    (조각, 코사인 거리) 를 가까운 순으로. 거리는 0(같음) ~ 1(무관) ~ 2(정반대).
    임계값 판단은 부르는 쪽 몫임.
    조각의 document 는 같이 실려 온다 — 세션 밖에서 읽어도 안전하고, 왕복도 1번이다

    # examples
        search_with_score(db, vector, top_k=2)  -> [(Chunk(id=7), 0.21), (Chunk(id=2), 0.48)]
    """
    # 정렬 키와 반환 값이 같은 식이어야 순서와 숫자가 어긋나지 않음
    distance = Chunk.embedding.cosine_distance(query_vector)
    query = (
        db.query(Chunk, distance)
        # 부르는 쪽이 전부 document 를 본다 — ask.py 는 title(출처 칩),
        # generator.py 는 meta(답변에 쓸 숫자). 이 줄이 없으면 조각마다
        # documents 를 한 번씩 더 쳐서 top_k=10 에 SELECT 11번이 된다.
        # top_k 를 올릴수록 왕복이 같이 늘어나므로 여기서 한 번에 붙인다
        .options(joinedload(Chunk.document))
        .filter(Chunk.embedding.is_not(None))
    )
    if crops:
        # meta 는 JSONB 다. ->> 로 문자열을 꺼내 비교한다.
        #
        # ⚠ **order_by·limit 보다 먼저 걸어야 한다.** 10개를 뽑은 뒤 거르면 정답이 11위였을 때
        #   영영 안 나온다 — 필터의 목적이 "후보를 줄여 정답을 top_k 안으로 올리는 것" 이다.
        #
        # ⚠ join 이 아니라 has(EXISTS) 를 쓴다. joinedload 가 이미 documents 를 붙이고 있어
        #   join 을 또 걸면 같은 표를 두 번 조인하게 된다
        query = query.filter(
            Chunk.document.has(Document.meta["작물"].astext.in_(list(crops)))
        )
    rows = query.order_by(distance).limit(top_k).all()
    return [(chunk, float(dist)) for chunk, dist in rows]

