"""chunks 벡터 저장/조회. pgvector 문법을 아는 곳을 여기 하나로 묶는다."""

from collections.abc import Collection
from datetime import date

from sqlalchemy import Date, and_, func, or_, select
from sqlalchemy.dialects.postgresql import array
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
    on_date: date | None = None,
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
    on_date: 주면 meta 에 period_from/to 가 있는 문서는 그 날짜가 기간 안(연도 무시,
        'MM-DD' 비교)일 때만 후보가 된다. period 가 없는 문서(crop_stage·crop_guide·
        variety)는 영향받지 않는다 — 시기가 있는 문서만 거르는 것이지, 시기 없는
        문서를 빼는 게 아니다<br>
    on_date: 이 날짜에 해당하는 시기의 문서만 후보로 삼는다. **연도는 무시하고 월·일만** 본다 —
        weekly_note 는 2023~2026 네 해치가 같은 주차에 겹쳐 있고, 그게 근거를 두껍게 하는
        장치라 연도로 자르면 안 된다. period 가 없는 문서(crop_stage·crop_guide·variety)는
        영향받지 않는다 — 시기가 있는 문서만 거르는 것이지 없는 문서를 빼는 게 아니다<br>

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
        # meta['작물들'] 은 JSONB 배열이다. ?| 는 "배열 요소 중 하나라도 겹치나" 를 본다 —
        # weekly_notes 의 '마늘,양파' 같은 복수 작물이 '마늘' 검색에 걸리게 하려는 것이다.
        # 문자열 일치(meta['작물'].astext.in_)로는 '마늘,양파' 가 '마늘' 과 안 맞는다.
        #
        # ⚠ **order_by·limit 보다 먼저 걸어야 한다.** 10개를 뽑은 뒤 거르면 정답이 11위였을 때
        #   영영 안 나온다 — 필터의 목적이 "후보를 줄여 정답을 top_k 안으로 올리는 것" 이다.
        #
        # ⚠ has() 를 쓰지 않는다. joinedload 와 얽혀 상관 없는 EXISTS 가 만들어진다 —
        #   `EXISTS (SELECT 1 FROM documents, chunks WHERE ...)` 처럼 바깥 행과 안 묶여서,
        #   조건에 맞는 문서가 하나라도 있으면 **모든 행이 통과**한다(2026-09-17 실측).
        #   document_id IN (서브쿼리) 는 그런 함정이 없다
        query = query.filter(
            Chunk.document_id.in_(
                select(Document.id).where(Document.meta["작물들"].has_any(array(tuple(crops))))
            )
        )
    if on_date is not None:
        # 연도를 버리고 'MM-DD' 로 견준다. 12월→1월을 넘는 주(period_from > period_to)는
        # 그 주만 두 조각으로 나눠 본다 — 안 그러면 '12-30' <= md <= '01-05' 가 항상 거짓이다
        md = on_date.strftime("%m-%d")
        _from = func.to_char(Document.meta["period_from"].astext.cast(Date), "MM-DD")
        _to = func.to_char(Document.meta["period_to"].astext.cast(Date), "MM-DD")
        안쪽 = and_(_from <= md, md <= _to)              # 한 해 안에서 끝나는 보통의 주
        해넘김 = and_(_from > _to, or_(md >= _from, md <= _to))
        query = query.filter(
            Chunk.document_id.in_(
                select(Document.id).where(
                    or_(
                        # period 가 없는 문서는 시기를 안 따진다. 이 줄이 없으면
                        # crop_guide·variety 가 통째로 빠져 검색이 weekly 만 남는다
                        Document.meta["period_from"].astext.is_(None),
                        안쪽,
                        해넘김,
                    )
                )
            )
        )
    rows = query.order_by(distance).limit(top_k).all()
    return [(chunk, float(dist)) for chunk, dist in rows]

