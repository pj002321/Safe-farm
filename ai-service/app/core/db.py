"""DB 연결. 엔진은 처음 쓸 때 만든다 — 접속 정보가 없어도 import 는 되어야 한다."""

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import (
    DATABASE_URL,
    DB_CONNECT_TIMEOUT,
    DB_HOST,
    DB_NAME,
    DB_PASSWORD,
    DB_POOL_RECYCLE,
    DB_POOL_SIZE,
    DB_PORT,
    DB_SSLMODE,
    DB_USER,
)

Base = declarative_base()
SessionLocal = sessionmaker()

_engine: Engine | None = None


def _resolve_url() -> str | URL:
    """DATABASE_URL 이 있으면 그쪽, 없으면 조각으로 조립.

    URL.create 가 비번을 대신 인코딩한다. 문자열로 이으면 @ 가 든 비번에서
    호스트 경계가 밀리는데, 에러 없이 조용히 틀린다.
    """
    if DATABASE_URL:
        return DATABASE_URL
    if not DB_HOST:
        raise RuntimeError(
            "DB 접속 정보가 없습니다. ai-service/.env.local 에 둘 중 하나를 넣으세요.\n"
            "  1) DATABASE_URL=postgresql://...  (비밀번호는 퍼센트 인코딩)\n"
            "  2) DB_HOST / DB_USER / DB_PASSWORD (+ DB_PORT, DB_NAME)  (비밀번호 날것)"
        )
    return URL.create(
        "postgresql+psycopg2",
        username=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
    )


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(
            _resolve_url(),
            pool_pre_ping=True,  # pooler 가 유휴 연결을 말없이 끊는다. 긴 배치가 여기서 죽는다
            pool_recycle=DB_POOL_RECYCLE,
            pool_size=DB_POOL_SIZE,
            max_overflow=0,  # 배치가 연결을 불려 pooler 한도를 치지 않게
            connect_args={"sslmode": DB_SSLMODE, "connect_timeout": DB_CONNECT_TIMEOUT},
        )
    return _engine


def new_session() -> Session:
    """배치 스크립트용. 쓰는 쪽이 close 까지 책임진다."""
    return SessionLocal(bind=get_engine())


def get_db():
    """FastAPI 의존성. 요청 하나에 세션 하나."""
    db = new_session()
    try:
        yield db
    finally:
        db.close()
