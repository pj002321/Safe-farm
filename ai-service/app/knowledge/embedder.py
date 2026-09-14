"""OpenAI 임베딩 API 래퍼로 텍스트를 숫자 벡터로 바꾸는 딱 한 가지 일을 한다."""

from openai import OpenAI

from app.core.config import EMBED_MODEL,OPENAI_API_KEY

_client = OpenAI(api_key=OPENAI_API_KEY)

def embed_texts(texts: list[str]) -> list[list[float]]:
    response = _client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [item.embedding for item in response.data]


