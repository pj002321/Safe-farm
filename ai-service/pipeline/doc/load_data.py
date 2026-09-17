"""소스(CSV·DB) -> documents. 자르지도, 임베딩하지도 않는다.

본문이 그대로면 건드리지 않는다(content_hash 비교). 바뀐 행은 갱신하면서 조각을
지우고, 그 자리를 chunk.py 가 다시 채운다 — 세 단계가 이 규칙 하나로 이어진다.

소스에서 사라진 행의 문서는 지운다. 남기면 옛 본문이 임베딩된 채로 검색에 계속
걸려서, 답변이 지금 DB 에 없는 값을 근거로 나온다.

실행: python -m pipeline.doc.load_data
"""

import hashlib

from app.core.db import new_session
from app.models.document import Document
from pipeline.doc.sources import (
    SOURCES,
    DbEmbedSource,
    build_content,
    build_external_id,
    build_meta,
    build_title,
    read_rows,
)


def content_hash(text: str) -> str:
    """
    # summary
    본문의 sha256. 재색인할지 말지를 이 값 하나로 판단한다.

    # params
    text: 해시할 본문<br>

    # returns
    64자 16진수 문자열. 같은 본문이면 항상 같은 값이다

    # examples
        content_hash("작물: 상추")  -> '017c5dd1...'
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_source(db, source: DbEmbedSource) -> dict[str, int]:
    """
    # summary
    소스 하나를 documents 에 반영한다. 본문이 그대로면 건드리지 않고, 바뀌었으면
    조각을 지운다 — 그 자리를 chunk.py 가 다시 채운다.

    # params
    db: 세션. 이 함수 안에서 commit 까지 한다<br>
    source: 읽을 소스<br>

    # returns
    처리 건수. 키는 new·updated·unchanged·skipped·deleted 다섯 개로 고정이다.
    skipped 는 본문이 빈 행 — 임베딩할 것이 없어 문서를 만들지 않는다.
    deleted 는 소스에서 사라진 행의 문서 — 조각까지 같이 지운다

    # examples
        load_source(db, SOURCES[0])
        -> {'new': 65, 'updated': 6, 'unchanged': 0, 'skipped': 0, 'deleted': 11}
    """
    rows = read_rows(source, db)

    # 한 번에 읽어둔다. 행마다 SELECT 하면 수천 행에서 왕복 비용이 시간이 된다.
    existing = {
        doc.external_id: doc for doc in db.query(Document).filter(Document.source == source.name)
    }

    stat = {"new": 0, "updated": 0, "unchanged": 0, "skipped": 0, "deleted": 0}

    # 이번 실행에서 쿼리가 실제로 내놓은 식별자. 루프가 끝난 뒤 existing 에서
    # 이걸 빼면 남는 것이 고아다
    seen: set[str] = set()

    for line_no, row in enumerate(rows, start=1):
        content = build_content(source, row)
        if not content:
            stat["skipped"] += 1  # 임베딩할 것이 없다
            continue

        external_id = build_external_id(source, row, line_no)
        seen.add(external_id)
        digest = content_hash(content)
        title = build_title(source, row)
        meta = build_meta(source, row)

        doc = existing.get(external_id)
        if doc is None:
            db.add(
                Document(
                    source=source.name,
                    external_id=external_id,
                    title=title,
                    content=content,
                    meta=meta,
                    content_hash=digest,
                )
            )
            stat["new"] += 1
        elif doc.content_hash != digest:
            doc.title, doc.content, doc.meta, doc.content_hash = title, content, meta, digest
            doc.chunks.clear()  # chunk.py 가 다시 채운다
            stat["updated"] += 1
        else:
            # 본문이 같으면 재임베딩 없이 메타만 갱신
            doc.title, doc.meta = title, meta
            stat["unchanged"] += 1

    # 소스에서 사라진 행의 문서. 위 루프는 쿼리가 내놓은 행만 돌기 때문에 여기
    # 남은 것들은 아무도 건드리지 않는다 — 옛 본문이 임베딩까지 끝난 채로 검색에
    # 계속 걸린다. 더미 시절 '상추 EARLY' 11건이 실제로 그랬다(2026-09-16).
    #
    # upsert 는 지우지 않는다. 이 프로젝트에서 같은 함정을 crops·crop_variants·
    # crop_stages 에서 이미 밟았다 — 넣는 쪽만 만들면 지우는 쪽이 늘 빠진다.
    #
    # chunks 는 Document.chunks 의 cascade="all, delete-orphan" 이 같이 지운다
    for external_id, doc in existing.items():
        if external_id not in seen:
            db.delete(doc)
            stat["deleted"] += 1

    db.commit()
    return stat


def main() -> None:
    """
    # summary
    SOURCES 를 전부 돌며 documents 에 반영하고 소스별 건수를 찍는다.

    # params
    없다<br>

    # examples
        py -3.12 -m pipeline.doc.load_data
    """
    db = new_session()
    try:
        total = {"new": 0, "updated": 0, "unchanged": 0, "skipped": 0, "deleted": 0}
        for source in SOURCES:
            stat = load_source(db, source)
            print(
                f"[{source.name}] 새로 {stat['new']} / 갱신 {stat['updated']} "
                f"/ 그대로 {stat['unchanged']} / 본문없음 {stat['skipped']} "
                f"/ 지움 {stat['deleted']}"
            )
            for key in total:
                total[key] += stat[key]
        print(f"합계: 새로 {total['new']} / 갱신 {total['updated']} / 지움 {total['deleted']}")
        print("이어서 python -m pipeline.doc.chunk 를 실행하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
