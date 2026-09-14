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

from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import DATABASE_URL

Base = declarative_base()


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """엔진을 한 번만 만들어 재사용한다. DATABASE_URL 이 없으면 여기서 던진다."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL 이 설정되지 않았습니다. "
            "Supabase > Project Settings > Database > Connection string 의 "
            "Session mode(5432) 값을 넣으세요."
        )
    return create_engine(
        DATABASE_URL,
        # 풀러가 유휴 연결을 끊으므로 꺼내 쓰기 전에 살아있는지 확인한다.
        pool_pre_ping=True,
        # 컨테이너 하나가 들고 있을 연결 수. Supabase Nano 는 풀러 클라이언트
        # 연결이 200개라, 레플리카를 늘릴 것을 감안해 작게 잡는다.
        pool_size=5,
        max_overflow=5,
    )


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db():
    """FastAPI 의존성. 요청 하나당 세션 하나."""
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()
