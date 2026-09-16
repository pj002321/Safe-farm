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
    "자료에 없는 내용은 지어내지 말고 모른다고 답하라. "
    "'참고값' 은 DB 실측이다 — 숫자를 물으면 그 값을 그대로 인용하고, "
    "거기 없는 숫자는 추정하지 마라. 3문장 이내로 답하라."
)


def build_context(matches: list[tuple[Chunk, float]]) -> str:
    """
    # summary
    검색된 조각을 근거 자료 한 덩이로 잇는다. 조각 본문 뒤에 그 문서의 meta 를 붙인다.

    ⚠ **본문에는 숫자가 없다.** pipeline/doc/sources.py 가 일부러 뺐다 — 숫자를
      본문에 넣으면 문서가 다 비슷해져 유사도가 내용과 무관해진다. 그래서 숫자는
      documents.meta 에만 있고, 답변을 만들 때 여기서 다시 합쳐야 LLM 이 볼 수 있다.
      본문만 넘기면 "며칠 걸리나" 에 "모른다"가 나간다.

    # params
    matches: (Chunk, 거리) 목록<br>

    # returns
    조각마다 본문 + '참고값' 한 줄. 빈 줄 둘로 이어 붙인 문자열.
    meta 가 빈 문서는 본문만 들어간다

    # examples
        build_context([(chunk, 0.12)])
        -> '작물: 상추 ... 관리요령: 흙이...\\n참고값: base_temp=4.0 · gdd_target=500'
    """
    blocks = []
    for chunk, _ in matches:
        # sorted 로 순서를 고정한다. JSONB 는 키 순서를 보장하지 않아서 같은 질문에도
        # 프롬프트가 매번 달라진다 — 재현이 안 되고 프롬프트 캐시도 못 탄다
        meta = sorted((chunk.document.meta or {}).items())
        numbers = " · ".join(f"{key}={value}" for key, value in meta)
        blocks.append(f"{chunk.body}\n참고값: {numbers}" if numbers else chunk.body)
    return "\n\n".join(blocks)


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

    context = build_context(matches)
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

    context = build_context(matches)
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