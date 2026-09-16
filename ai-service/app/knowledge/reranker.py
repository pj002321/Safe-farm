"""벡터 거리만으론 못 잡는 어휘 일치를 반영해 top-k 순서를 보정한다.

크로스인코더 같은 리랭킹 모델은 안 쓴다 — 문서 수(17건)가 적어 과함.
질문·본문 단어 겹침만으로 타이브레이커를 주는 가벼운 방식.
"""

from app.models.chunk import Chunk

# 겹치는 단어 하나당 거리를 이만큼 깎는다. 코사인 거리 범위(0~2)에 비해 작게 잡아,
# 벡터 유사도 순위를 뒤집기보다 비슷한 후보 사이 타이브레이커로만 작동하게 한다.
# ponytail: 실측 튜닝값 아님 — 오답 사례 쌓이면 조정.
OVERLAP_WEIGHT = 0.05

def rerank(question: str, matches: list[tuple[Chunk, float]]) -> list[tuple[Chunk, float]]:
    """질문 단어와 본문 단어가 겹칠수록 앞으로 당긴다. distance 값 자체는 안 바꾼다 —
    정렬 순서만 바뀌고, 응답에 나가는 거리는 여전히 진짜 코사인 거리다.
    """
    q_words = set(question.split())

    def sort_key(item: tuple[Chunk, float]) -> float:
        chunk, dist = item
        overlap = len(q_words & set(chunk.body.split()))
        return dist - overlap * OVERLAP_WEIGHT

    return sorted(matches, key=sort_key)