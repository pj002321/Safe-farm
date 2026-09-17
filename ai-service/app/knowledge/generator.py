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
    # ⚠ '없다' 의 뜻을 좁힌다. "그 단어가 없다" 로 읽으면 "반점" 을 물었을 때 노균병 자료를 두고도
    #    "자료에 반점 언급 없음" 으로 끝낸다(2026-09-17 실측). 증상은 병명으로 적혀 있다
    "질문의 표현이 자료와 달라도 뜻이 통하면 그 자료를 근거로 답하라 — "
    "'반점' 을 물으면 자료의 노균병·점무늬병이 그 답이다. 단어가 그대로 없다는 이유로 모른다고 하지 마라. "
    # V1-79 진단 확정 금지
    "증상을 물으면 자료에 있는 병해충 후보를 **여럿** 들고 각각 왜 그런지 한 줄씩 붙여라. "
    "하나로 확진하지 말고 '~일 가능성이 높다 / ~도 가능하다' 로 확신도를 나눠라. "
    "'참고값' 은 DB 실측이다 — 숫자를 물으면 그 값을 그대로 인용하고, "
    "거기 없는 숫자는 추정하지 마라. "
    "각 자료는 '[출처 · 제목]' 으로 시작한다. **참고값은 바로 그 자료의 것이다** — "
    "다른 자료의 숫자를 이 제목에 갖다 붙이지 마라. "
    "품종 이름이 붙지 않은 값(작물 단위 수확일수·적산온도 등)을 특정 품종의 값처럼 말하지 마라. "
    # "3문장 이내" 를 푼다. 후보가 셋이면 세 줄이 맞다. 대신 늘어지는 것을 막는 규칙을 준다
    "답은 근거 하나에 한두 문장씩. 근거가 여럿이면 항목마다 줄을 바꾸고 끝에 [출처 제목] 을 붙여라. "
    "근거가 하나면 세 문장 안에 끝내라. "
    # 자료에 없는 것 — 참고2 가 "교육비·물가·지하철 노선…" 을 열거한 것과 같은 자리
    "이 자료에 없는 것: 농약 등록 기준·희석배수, 품종별 가격·시세, 지역별 판로, 사진 없는 확진. "
    "이것을 물으면 없다고 말하고 어디서 확인할지만 알려라."
)

# 검색 필터용 키. 사람이 읽을 값이 아니라 '참고값' 에서 뺀다
# ('작물' 은 그대로 둔다 — 그건 사람이 읽는 값이다)
META_SKIP = frozenset({"작물들"})

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
        meta = sorted(
            (k, v) for k, v in (chunk.document.meta or {}).items() if k not in META_SKIP
        )
        numbers = " · ".join(f"{key}={value}" for key, value in meta)
        # ⚠ 제목을 앞에 박는다. 이게 없으면 LLM 이 **다른 문서의 참고값을 이 문서에 갖다 붙인다** —
        #   "상추 수확까지 며칠" 에 crop_stage 의 days_to_harvest=31 을 품종 '미홍' 의 값으로
        #   답한 사례가 있었다(2026-09-17). 소스가 늘수록 섞일 자리가 는다
        머리 = f"[{chunk.document.source} · {chunk.document.title}]" if chunk.document.title \
            else f"[{chunk.document.source}]"
        본문 = f"{머리}\n{chunk.body}"
        blocks.append(f"{본문}\n참고값: {numbers}" if numbers else 본문)
    return "\n\n".join(blocks)


def _build_messages(
    question: str,
    matches: list[tuple[Chunk, float]],
    plot_context: str | None,
    history_context: str | None = None,
) -> list[dict[str, str]]:
    """system + user 메시지를 조립한다. plot_context 가 있으면 참고 자료 앞에 붙여
    "일반론이 아니라 이 밭 기준"으로 답하게 한다 — 없으면(V1 하위호환) 예전과 동일하다.

    history_context 는 맨 앞에 둔다. 답의 근거는 어디까지나 참고 자료라서, 지난
    대화가 자료보다 뒤에 오면 모델이 그쪽을 근거로 읽는다. 순서로 위계를 준다
    (app/domain/history_context.py).
    """
    context = build_context(matches)
    user_content = f"참고 자료:\n{context}\n\n질문: {question}"
    if plot_context:
        user_content = f"밭 정보:\n{plot_context}\n\n{user_content}"
    if history_context:
        user_content = (
            f"지난 대화(참고만, 근거로 쓰지 말 것):\n{history_context}\n\n{user_content}"
        )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def generate_answer(
    question: str,
    matches: list[tuple[Chunk, float]],
    plot_context: str | None = None,
    history_context: str | None = None,
) -> str:
    """
    # summary
    검색된 조각을 근거 자료로 붙여 질문에 답하는 문장을 만든다.

    # params
    question: 사용자 질문<br>
    matches: (Chunk, 거리) 목록. 비어 있으면 호출하지 말 것 — 근거 없이 부르면
    할루시네이션 방지 프롬프트가 무의미해진다<br>
    plot_context: app/service/ask_context.py 가 만든 밭 요약. 없으면 예전처럼 답한다<br>
    history_context: app/domain/history_context.py 가 만든 지난 대화.
    없으면 단발 질문으로 답한다<br>

    # returns
    LLM 이 생성한 답변 문자열

    # examples
        generate_answer("상추 발아기 물주기", [(chunk, 0.12)])  -> "발아 직후에는..."
    """
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=_build_messages(question, matches, plot_context, history_context),
    )
    return response.choices[0].message.content


def stream_answer(
    question: str,
    matches: list[tuple[Chunk, float]],
    plot_context: str | None = None,
    history_context: str | None = None,
):
    """토큰이 오는 대로 문자열 조각을 yield한다. matches 가 비어 있으면 부르지 말 것 —
    generate_answer 와 동일한 계약이다.
    """
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    stream = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=_build_messages(question, matches, plot_context, history_context),
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta