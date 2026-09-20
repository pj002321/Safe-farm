"""검색된 조각을 근거로 답변 문장을 만든다.

RAG 의 generate 단계. ask-flow 그래프(app/graph/graph.py)의 generate 노드가
stream_answer 를 그대로 부른다.
"""

import logging

from app.core.config import ANSWER_MAX_TOKENS, CONTEXT_CHAR_BUDGET, OPENAI_MODEL
from app.knowledge.embedder import get_client
from app.models.chunk import Chunk

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

# 쓸 수 있는 출처 이름을 미리 알려 둔다. SOURCE_LABELS 에서 만들어서 라벨을 고쳐도
# 프롬프트와 따로 놀지 않는다 — dict 는 넣은 순서를 지키므로 글자열이 매번 같다
_SOURCE_GLOSSARY = (
    "참고 자료의 출처 이름은 다음 일곱 가지뿐이다 — "
    + " · ".join(SOURCE_LABELS.values())
    + ". 이 목록에 없는 이름을 [출처 · 제목] 자리에 지어내지 마라. "
)

# '참고값' 은 DB 칼럼 이름 그대로 나간다(pipeline/doc/sources.py 의 label). 뜻을 안
# 알려주면 모델이 단위를 짐작하거나 'base_temp 는 5입니다' 처럼 영문 키를 그대로 옮긴다
_META_GLOSSARY = (
    "'참고값' 줄의 이름은 DB 칼럼 이름 그대로라 사람이 읽는 말이 아니다. 뜻은 이렇다: "
    "base_temp 는 생육 기준온도(℃)로 이 온도를 넘는 만큼만 적산한다. "
    "gdd_from·gdd_to 는 그 생육단계가 이어지는 적산온도 구간이다. "
    "gdd_target 은 수확까지 필요한 누적 적산온도, "
    "days_to_harvest 는 파종부터 수확까지의 날수(일)다. "
    "water_need_mm 은 그 단계에 필요한 물의 양(mm), "
    "fertilize_needed 는 웃거름이 필요한지 여부다. "
    "sow_from·sow_to 는 파종 적기의 시작과 끝, sow_method 는 파종 방법, "
    "stage_order 는 생육단계의 차례, difficulty 는 재배 난이도다. "
    "variety_no 는 품종 등록번호, maturity_type 은 숙기 구분, bred_year 는 육성 연도다. "
    "gdd_to 는 그 단계에 포함되지 않는다 — 'gdd_from 이상 gdd_to 미만' 이 그 단계의 구간이다. "
    "이 이름들을 영어 그대로 답에 옮기지 말고 위의 한국어 뜻으로 풀어서 말하라. "
    "뜻을 모르는 이름이 참고값에 있으면 그 값은 인용하지 마라. "
)

# 줄바꿈 규칙은 말로만 적혀 있었다. 예시 하나가 규칙 여럿을 한 번에 보여준다
_FORMAT_EXAMPLE = (
    "형식 예를 든다. 근거가 둘이면 이렇게 쓴다 — "
    "'상추는 파종 뒤 30일쯤 수확합니다.\n[생육단계 정보 · 상추 청치마]\n"
    "잎에 노란 반점이 번지면 노균병일 가능성이 높습니다.\n[병해충 속보 · 상추 노균병]' "
    "처럼 문장을 쓰고 줄을 바꿔 출처를 붙인다. "
)

# ⚠ **길이를 줄이지 말 것.** OpenAI 자동 프롬프트 캐시는 프롬프트 앞머리가
#   1,024 토큰을 넘을 때만 걸린다. 이 프롬프트가 요청마다 글자까지 같은 유일한
#   부분이라, 여기가 문턱 아래로 내려가면 캐시가 통째로 사라진다(값이 아니라 0/1 이다).
#   `tests/test_prompt_cache_threshold.py` 가 그 선을 지킨다 — 문구를 고치고 그
#   테스트가 빨개지면 줄인 만큼 다른 곳을 채우거나, 캐시를 포기한다고 정해야 한다.
SYSTEM_PROMPT = (
    "너는 농업 컨설턴트다. 아래 참고 자료와 밭 정보를 우선 근거로 질문에 답하라. "
    "밭 정보는 이 사용자의 밭을 DB에서 실측한 값이다 — 참고 자료와 똑같이 근거로 쓴다. "
    "참고 자료도 밭 정보도 둘 다 없다고 해서 '자료가 없어 답변이 어렵습니다' 처럼 "
    "먼저 거부하지 마라 — 질문에 곧장 답하되, 그 답이 너의 일반 농업 지식임을 "
    "'정확한 수치 자료는 없지만 일반적으로는' 처럼 자연스러운 문장 하나로만 구분하라. "
    "'[일반 지식]' 같은 대괄호 표시는 붙이지 말고, "
    "참고 자료·밭 정보 근거와 섞어서 마치 거기 있는 값인 것처럼 말하지 마라. "
    "농업과 무관하거나 지식으로도 답할 수 없을 때만 모른다고 답하라. "
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
    "대답의 마침표는 친절하게 '~요', '~입니다' 형식으로 끝낸다. "
    + _SOURCE_GLOSSARY
    + _META_GLOSSARY
    + _FORMAT_EXAMPLE
)

def build_context(matches: list[tuple[Chunk, float]], budget: int = CONTEXT_CHAR_BUDGET) -> str:
    """
    # summary
    검색된 조각을 근거 자료 한 덩이로 잇는다. 조각 본문 뒤에 그 문서의 meta 를 붙인다.
    `budget` 글자를 넘기면 **뒤에서부터 버린다.**

    ⚠ **본문에는 숫자가 없다.** pipeline/doc/sources.py 가 일부러 뺐다 — 숫자를
      본문에 넣으면 문서가 다 비슷해져 유사도가 내용과 무관해진다. 그래서 숫자는
      documents.meta 에만 있고, 답변을 만들 때 여기서 다시 합쳐야 LLM 이 볼 수 있다.
      본문만 넘기면 "며칠 걸리나" 에 "모른다"가 나간다.

    ⚠ **뒤에서 버리는 것이 맞다.** 들어오는 순서가 곧 중요도다 — 앞은 리랭크까지
      끝난 matches, 뒤는 같은 문서의 앞뒤 조각(neighbors)이다. 후자는 근거를 두껍게
      하는 덤이라 먼저 포기할 것이 그쪽이다. 순서를 바꿔 자르면 1위 근거가 빠진다.

    ⚠ **조각을 중간에서 자르지 않는다.** 문장이 끊긴 근거는 모델이 뒤를 지어내게
      만든다. 예산을 넘겨도 첫 조각은 항상 넣는다 — 근거 0건으로 부르면 일반 지식
      답변이 나가는데, 그건 예산 초과가 아니라 검색 실패일 때의 동작이다.

    # params
    matches: (Chunk, 거리) 목록<br>
    budget: 글자 상한. 0 이하면 무제한. 기본값은 config.CONTEXT_CHAR_BUDGET<br>

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
    return "\n\n".join(_fit_budget(blocks, budget))


def _fit_budget(blocks: list[str], budget: int) -> list[str]:
    """예산 안에 드는 앞쪽 블록만. 예산이 0 이하면 전부 그대로."""
    if budget <= 0 or not blocks:
        return blocks

    kept: list[str] = []
    used = 0
    for block in blocks:
        # 이어 붙일 때 들어가는 빈 줄 둘까지 세야 실제 길이와 맞는다
        added = len(block) + (2 if kept else 0)
        if kept and used + added > budget:
            break
        kept.append(block)
        used += added

    if len(kept) < len(blocks):
        logging.info(
            "[generator] 근거 %d개 중 %d개만 넣음(%d자 / 예산 %d자)",
            len(blocks), len(kept), used, budget,
        )
    return kept


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

    쓴 토큰을 로그에 남긴다. 스트리밍은 기본적으로 usage 를 주지 않아
    `include_usage` 를 켜야 하는데, 그러면 **choices 가 빈 마지막 청크**가 하나 더
    온다 — 그걸 예전처럼 `chunk.choices[0]` 로 읽으면 IndexError 로 답변 끝에서
    터진다. 실제 소비량을 모르면 상한도 프롬프트도 짐작으로 고칠 수밖에 없다.
    """
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    stream = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=_build_messages(question, matches, plot_context, history_context),
        stream=True,
        max_tokens=ANSWER_MAX_TOKENS,
        stream_options={"include_usage": True},
    )
    for chunk in stream:
        usage = getattr(chunk, "usage", None)
        if usage is not None:
            cached = getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", 0)
            logging.info(
                "[generator] 입력 %s(캐시 %s) · 출력 %s",
                usage.prompt_tokens, cached or 0, usage.completion_tokens,
            )
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta