"""OpenAI 임베딩 API 래퍼"""

from openai import OpenAI
from app.core.config import OPENAI_API_KEY,EMBED_MODEL,DIMENSION

_client = OpenAI(api_key=OPENAI_API_KEY)

def embed_texts(texts: list[str]) -> list[list[float]]:
    """TODO: _client.embeddings.create(...) 호출 후
       response.data[i].embedding 모아서 반환"""
    raise NotImplementedError


