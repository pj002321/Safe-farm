import os
from pathlib import Path

from dotenv import load_dotenv

# 로컬 값은 .env.local 에 둔다 (AGENTS.md — 서비스 계정/API 키는 저장소에 넣지 않는다).
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

DATABASE_URL = os.getenv("DATABASE_URL")
KMA_API_KEY = os.getenv("KMA_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL")
EMBED_MODEL = "text-embedding-3-small"
DIMENSION = 1536