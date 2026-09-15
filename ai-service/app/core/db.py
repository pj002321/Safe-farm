"""DB 연결과 세션.

왜 엔진을 모듈 최상위에서 만들지 않는가:
    예전 코드는 `engine = create_engine(DATABASE_URL)` 을 import 시점에 실행했다.
    DATABASE_URL 이 비어 있으면 **모듈을 import 하는 것만으로** 예외가 터진다.
    로컬에서는 바로 보이지만, 컨테이너(Railway·Cloud Run)에서는 "앱이 포트를
    열지 않았다"는 모호한 오류로만 나타나서 원인을 찾기 어렵다.
    그래서 첫 사용 시점까지 미룬다 — DB 없이도 앱이 뜨고 /health 가 응답한다.

Supabase 연결 시 주의:
    - **Session mode(5432)** 를 쓴다. 호스트가 `aws-N-REGION.pooler.supabase.com`,
      유저가 `postgres.<프로젝트REF>` 인 쪽이다. Direct(db.<REF>.supabase.co)는
      IPv6 전용이라 대부분의 컨테이너 호스트에서 안 붙는다.
    - `pool_pre_ping=True` 가 필수다. 풀러가 유휴 연결을 끊는데, 이게 없으면
      다음 요청이 죽은 커넥션을 집어 `server closed the connection unexpectedly`
      로 실패한다. 간헐적이라 재현이 어려운 종류다.
"""

from __future__ import annotations

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
    """
    # summary
    엔진을 처음 쓸 때 만들어 재사용한다. import 시점에 만들면 접속 정보가 없을 때
    모듈을 import 하는 것만으로 죽고, 컨테이너에서는 원인이 안 보이는 오류로 나타난다.

    # params
    없다. 접속 정보는 config 에서 읽는다<br>

    # returns
    SQLAlchemy 엔진. 매번 같은 인스턴스다. 접속 정보가 없으면 RuntimeError

    # examples
        with get_engine().begin() as con: ...
    """
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
    """
    # summary
    배치 스크립트용 세션. 쓰는 쪽이 close 까지 책임진다.

    # params
    없다<br>

    # returns
    새 세션. 부를 때마다 다른 인스턴스다 — 닫아야 연결이 풀로 돌아간다

    # examples
        db = new_session()
        try: ...
        finally: db.close()
    """
    return SessionLocal(bind=get_engine())


def get_db():
    """
    # summary
    FastAPI 의존성. 요청 하나당 세션 하나를 내어주고 끝나면 닫는다.

    # params
    없다<br>

    # returns
    세션을 하나 내어주는 제너레이터. Depends 가 이 규약을 쓴다

    # examples
        def handler(db: Session = Depends(get_db)): ...
    """
    db = new_session()
    try:
        yield db
    finally:
        db.close()
