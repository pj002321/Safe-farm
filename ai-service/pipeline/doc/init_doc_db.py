"""documents·chunks 등 core.db.Base 소속 테이블과 pgvector 확장을 만든다. farm 쪽은 init_farm_db.py 가 맡는다.

몇 번을 돌려도 안전하고, 지우는 것은 없다.

실행: python -m pipeline.doc.init_doc_db
"""

from sqlalchemy import text

from app.core.db import Base, get_engine
from app.models import (  # noqa: F401  Base.metadata 에 등록시키려고 import
    Chunk,
    DisasterRule,
    Document,
    Normal,
    OfficialAlert,
    WeatherDaily,
)


def main() -> None:
    engine = get_engine()
    with engine.begin() as con:
        # Vector 컬럼 타입이 여기 딸려 있다. 테이블보다 먼저.
        con.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.create_all(engine, checkfirst=True)
    print("테이블 준비 완료:", ", ".join(sorted(Base.metadata.tables)))


if __name__ == "__main__":
    main()
