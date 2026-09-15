"""텍스트 -> 벡터. 색인(pipeline)과 질의(retriever)가 이 함수 하나를 같이 쓴다.

두 벌로 두면 한쪽만 모델이 바뀌어 벡터 공간이 갈린다.
"""

from openai import OpenAI

from app.core.config import DIMENSION, EMBED_BATCH_SIZE, EMBED_MODEL, OPENAI_API_KEY

_client = None


def get_client() -> OpenAI:
    """
    # summary
    OpenAI 클라이언트. 키가 없을 때 import 만으로 죽지 않도록 처음 쓸 때 만든다.

    # params
    없다. 키는 config 의 OPENAI_API_KEY<br>

    # returns
    클라이언트. 매번 같은 인스턴스다. 키가 없으면 RuntimeError

    # examples
        get_client().embeddings.create(model=EMBED_MODEL, input=batch)
    """
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY 가 없습니다. ai-service/.env 를 확인하세요.")
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    # summary
    텍스트를 벡터로. 색인(pipeline)과 질의(retriever)가 이 함수 하나를 같이 쓴다 —
    두 벌로 두면 한쪽만 모델이 바뀌어 벡터 공간이 갈린다.
    요청당 토큰 상한이 있어 EMBED_BATCH_SIZE 로 나눠 보낸다.

    # params
    texts: 임베딩할 문자열 목록<br>

    # returns
    입력과 같은 순서·같은 길이의 벡터 목록. texts 가 비면 빈 리스트.
    차원이 DIMENSION 과 다르면 ValueError — DB 까지 가면 INSERT 에서야 터진다

    # examples
        embed_texts(["상추 발아기 물주기"])  -> [[0.01, -0.02, ...]]   # 길이 1536
    """
    if not texts:
        return []

    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start : start + EMBED_BATCH_SIZE]
        response = get_client().embeddings.create(model=EMBED_MODEL, input=batch)
        # 응답 순서를 믿지 않는다
        ordered = sorted(response.data, key=lambda item: item.index)
        vectors.extend(item.embedding for item in ordered)

    # 차원이 어긋난 채 DB 까지 가면 INSERT 에서야 터져 원인이 안 보인다
    wrong = [i for i, v in enumerate(vectors) if len(v) != DIMENSION]
    if wrong:
        raise ValueError(f"차원이 {DIMENSION} 이 아닌 벡터 {len(wrong)}개 (예: {wrong[:3]}번)")
    return vectors
