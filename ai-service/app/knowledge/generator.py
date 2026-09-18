"""검색된 조각을 근거로 답변 문장을 만든다.

RAG 의 generate 단계. ask-flow 그래프(app/graph/graph.py)의 generate 노드가
stream_answer 를 그대로 부른다.
"""

from app.core.config import OPENAI_MODEL
from app.knowledge.embedder import get_client
from app.models.chunk import Chunk

SYSTEM_PROMPT = (
    "너는 농업 컨설턴트다. 아래 참고 자료와 밭 정보를 우선 근거로 질문에 답하라. "
    "밭 정보는 이 사용자의 밭을 DB에서 실측한 값이다 — 참고 자료와 똑같이 근거로 쓰고, "
    "'자료가 없다'는 말은 참고 자료도 밭 정보도 둘 다 없을 때만 하라. "
    "둘 다 없으면 너의 일반 농업 지식으로 답하되, '[일반 지식]' 같은 대괄호 표시를 붙이지 말고 "
    "'정확한 수치 자료는 없지만 일반적으로는' 처럼 자연스러운 문장으로 구분하라 — "
    "참고 자료·밭 정보 근거와 섞어서 마치 거기 있는 값인 것처럼 말하지 마라. "
    "농업과 무관하거나 지식으로도 답할 수 없으면 모른다고 답하라. "
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
    "답은 근거 하나에 한두 문장씩. 근거가 여럿이면 항목마다 줄을 바꾸고, "
    "그 문장 안에 섞지 말고 **줄을 바꿔 새 줄에** [출처 · 제목] 을 붙여라. "
    "근거가 하나면 세 문장 안에 끝내라. "
    "[출처 · 제목] 은 참고 자료를 인용할 때만 써라 — '[일반 지식]' '[밭 정보]' 처럼 "
    "다른 용도로 대괄호 표시를 지어내지 마라. 밭 정보나 일반 지식은 그냥 문장으로 말하면 된다. "
    # 자료에 없는 것 — 참고2 가 "교육비·물가·지하철 노선…" 을 열거한 것과 같은 자리
    "이 자료에 없는 것: 농약 등록 기준·희석배수, 품종별 가격·시세, 지역별 판로, 사진 없는 확진. "
    "이것을 물으면 없다고 말하고 어디서 확인할지만 알려라."
    "대답의 마침표는 친절하게 '~요', '~입니다' 형식으로 끝낸다."
    
)

# 검색 필터용 키. 사람이 읽을 값이 아니라 '참고값' 에서 뺀다
# ('작물' 은 그대로 둔다 — 그건 사람이 읽는 값이다)
META_SKIP = frozenset({"작물들"})

# documents.source 는 pipeline/doc/sources.py 의 영문 키 그대로다(적재 매칭용 식별자라
# 못 바꾼다 — 바꾸면 기존 문서를 전부 새 문서로 오인해 재청킹·재임베딩된다).
# 답변에 [출처 · 제목] 으로 그대로 노출되므로 여기서만 한글로 바꿔 보여준다
SOURCE_LABELS = {
    "crop_stage": "생육단계 정보",
    "variety_summary": "품종 요약",
    "variety_body": "품종 상세정보",
    "crop_guide": "작물 재배 가이드",
    "weekly_note": "주간농사정보",
    "pest_bulletin": "병해충 속보",
    "disaster_bulletin": "농업재해 속보",
}

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
        source = SOURCE_LABELS.get(chunk.document.source, chunk.document.source)
        머리 = f"[{source} · {chunk.document.title}]" if chunk.document.title \
            else f"[{source}]"
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


def stream_answer(
    question: str,
    matches: list[tuple[Chunk, float]],
    plot_context: str | None = None,
    history_context: str | None = None,
):
    """토큰이 오는 대로 문자열 조각을 yield한다. matches 가 비어도 부를 수 있다 —
    비어 있으면 SYSTEM_PROMPT 가 일반 지식으로 답하거나 모른다고 답하게 한다.
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