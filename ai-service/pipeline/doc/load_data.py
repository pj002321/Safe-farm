"""CSV -> documents. 자르지도, 임베딩하지도 않는다.

본문이 그대로면 건드리지 않는다(content_hash 비교). 바뀐 행은 갱신하면서 조각을
지우고, 그 자리를 chunk.py 가 다시 채운다 — 세 단계가 이 규칙 하나로 이어진다.

실행: python -m pipeline.doc.load_data
"""

import hashlib

from app.core.db import new_session
from app.models.document import Document
from pipeline.doc.sources import SOURCES, CsvSource, build_content, build_meta, read_rows


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_source(db, source: CsvSource) -> dict[str, int]:
    rows = read_rows(source)

    # 한 번에 읽어둔다. 행마다 SELECT 하면 수천 행에서 왕복 비용이 시간이 된다.
    existing = {
        doc.external_id: doc for doc in db.query(Document).filter(Document.source == source.name)
    }

    stat = {"new": 0, "updated": 0, "unchanged": 0, "skipped": 0}

    for line_no, row in enumerate(rows, start=1):
        content = build_content(source, row)
        if not content:
            stat["skipped"] += 1  # 임베딩할 것이 없다
            continue

        external_id = (row.get(source.id_column) or "").strip() if source.id_column else ""
        external_id = external_id or str(line_no)
        digest = content_hash(content)
        title = (row.get(source.title_column) or "").strip() if source.title_column else None
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

    db.commit()
    return stat


def main() -> None:
    db = new_session()
    try:
        total = {"new": 0, "updated": 0, "unchanged": 0, "skipped": 0}
        for source in SOURCES:
            stat = load_source(db, source)
            print(
                f"[{source.name}] 새로 {stat['new']} / 갱신 {stat['updated']} "
                f"/ 그대로 {stat['unchanged']} / 본문없음 {stat['skipped']}"
            )
            for key in total:
                total[key] += stat[key]
        print(f"합계: 새로 {total['new']} / 갱신 {total['updated']}")
        print("이어서 python -m pipeline.doc.chunk 를 실행하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
