"""검색된 조각을 근거로 답변 문장을 만든다.

RAG 의 generate 단계. `app/graph/` 의 LangGraph 는 작물 추천 전용이라(graph.py 주석
참고) 여기 끌어오지 않는다 — 질문 하나에 OpenAI 호출 한 번이면 끝나는 일에
그래프를 씌우는 건 과하다.
"""

from app.core.config import OPENAI_MODEL
from app.knowledge.embedder import get_client
from app.models.chunk import Chunk

SYSTEM_PROMPT = (
    "너는 농업 컨설턴트다. 아래 참고 자료에 있는 내용만 근거로 질문에 답하라. "
    "자료에 없는 내용은 지어내지 말고 모른다고 답하라. 3문장 이내로 답하라."
)


def generate_answer(question: str, matches: list[tuple[Chunk, float]]) -> str:
    """
    # summary
    검색된 조각을 근거 자료로 붙여 질문에 답하는 문장을 만든다.

    # params
    question: 사용자 질문<br>
    matches: (Chunk, 거리) 목록. 비어 있으면 호출하지 말 것 — 근거 없이 부르면
    할루시네이션 방지 프롬프트가 무의미해진다<br>

    # returns
    LLM 이 생성한 답변 문자열

    # examples
        generate_answer("상추 발아기 물주기", [(chunk, 0.12)])  -> "발아 직후에는..."
    """
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    context = "\n\n".join(chunk.body for chunk, _ in matches)
    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"참고 자료:\n{context}\n\n질문: {question}"},
        ],
    )
    return response.choices[0].message.content

def stream_answer(question: str, matches: list[tuple[Chunk, float]]):
    """토큰이 오는 대로 문자열 조각을 yield한다. matches 가 비어 있으면 부르지 말 것 —
    generate_answer 와 동일한 계약이다.
    """
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    context = "\n\n".join(chunk.body for chunk, _ in matches)
    stream = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"참고 자료:\n{context}\n\n질문: {question}"},
        ],
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta