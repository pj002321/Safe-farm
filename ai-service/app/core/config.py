"""환경값과 고정 상수. 여기 없는 설정을 다른 파일이 제 나름대로 정하지 않는다."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]  # ai-service/

# 순서가 곧 우선순위다 — 먼저 읽은 값을 뒤가 덮지 않는다(override=False 가 기본).
# 경로를 __file__ 기준 절대경로로 주는 게 핵심이다. 파일명만 넘기면 cwd 기준이 되어
# 레포 루트에서 `python -m pipeline.doc.embed` 를 돌릴 때 못 찾는다.
load_dotenv(BASE_DIR / ".env.local")  # 로컬 전용. gitignore 대상이라 실제 키를 여기 둔다
load_dotenv(BASE_DIR / ".env")  # 공용. 빠진 키만 채운다. 파일이 없어도 조용히 넘어간다

# --- 접속 ---
# 두 방식 중 하나. 조립은 db.py 가 한다 (이 파일에 SQLAlchemy 를 들이지 않으려고).
#   1) DATABASE_URL 한 줄  — 있으면 이쪽이 이긴다. 비번을 퍼센트 인코딩해야 한다(@ -> %40)
#   2) DB_HOST/USER/PASSWORD/PORT/NAME — 비번을 날것으로 둔다
# 포트: DDL 을 도는 init_*_db 는 5432(Direct), 런타임은 6543(Transaction pooler).


def _env_str(key: str, default: str | None = None) -> str | None:
    """빈 값은 '없음' 으로 친다."""
    raw = (os.getenv(key) or "").strip()
    return raw or default


def _env_int(key: str, default: int) -> int:
    """빈 값은 '없음' 으로 친다 — `DB_POOL_SIZE=` 처럼 키만 남기면 int('') 가 터진다."""
    raw = (os.getenv(key) or "").strip()
    return int(raw) if raw else default


def _normalize_db_url(url: str | None) -> str | None:
    """어느 쪽을 붙여넣어도 돌게 맞춘다. SQLAlchemy 2.x 는 `postgres://` 를 거부한다."""
    if not url:
        return None
    url = url.strip().strip('"').strip("'")  # 따옴표째 붙여넣는 실수가 잦다
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix) :]
    return url


DATABASE_URL = _normalize_db_url(os.getenv("DATABASE_URL"))

# DATABASE_URL 이 없을 때 db.py 가 이 조각들로 URL 을 만든다.
DB_HOST = _env_str("DB_HOST")
DB_PORT = _env_int("DB_PORT", 5432)
DB_USER = _env_str("DB_USER", "postgres")
DB_PASSWORD = _env_str("DB_PASSWORD")  # **퍼센트 인코딩하지 말 것.** 날것 그대로 둔다
DB_NAME = _env_str("DB_NAME", "postgres")

# 아래 넷은 바꿔도 이미 쌓인 데이터가 멀쩡한 운영값이라 env 로 뺀다.
DB_SSLMODE = _env_str("DB_SSLMODE", "require")  # SSL 없는 로컬 Postgres 면 disable
DB_CONNECT_TIMEOUT = _env_int("DB_CONNECT_TIMEOUT", 10)  # 초. 틀린 호스트에서 안 매달리게
DB_POOL_SIZE = _env_int("DB_POOL_SIZE", 5)  # 배치는 순차라 클 이유가 없다
DB_POOL_RECYCLE = _env_int("DB_POOL_RECYCLE", 1800)  # 초. pooler 가 끊기 전에 먼저 버린다

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL")
KMA_API_KEY = os.getenv("KMA_API_KEY")

# --- 임베딩 ---
# 아래 넷은 일부러 env 로 빼지 않는다. 바꾸면 쌓인 벡터가 무의미해지고(공간이 갈린다),
# DIMENSION 은 models/chunk.py 의 Vector(1536) 로 스키마에 박혀 있다. 교체 = 전량 재색인.
EMBED_MODEL = "text-embedding-3-small"
DIMENSION = 1536
EMBED_TOKENIZER = "cl100k_base"
EMBED_MAX_TOKENS = 8191  # 넘으면 뒤가 조용히 잘린다

EMBED_BATCH_SIZE = _env_int("EMBED_BATCH_SIZE", 100)  # 레이트리밋에 걸리면 줄인다

# --- 경로 ---
DATA_DIR = BASE_DIR / "data"
