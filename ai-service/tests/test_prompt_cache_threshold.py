"""SYSTEM_PROMPT 가 프롬프트 캐시 문턱을 넘는지.

OpenAI 자동 프롬프트 캐시는 **앞머리가 1,024 토큰을 넘을 때만** 걸린다. 넘으면
그 구간이 싸지고, 한 토큰이라도 모자라면 아무것도 안 걸린다 — 비율이 아니라 0/1 이다.

요청마다 글자까지 같은 부분은 SYSTEM_PROMPT 하나뿐이다(그 뒤 user 메시지는 질문·
근거·밭 정보라 매번 다르다). 그래서 캐시가 걸리느냐는 이 상수의 길이가 전부다.

문구를 다듬다 보면 길이는 조용히 줄어든다. 줄어들어도 답변은 멀쩡해서 아무도 모르고,
청구서에만 나타난다. 그 선을 여기서 지킨다.
"""

import tiktoken

from app.core.config import OPENAI_MODEL
from app.knowledge.generator import SOURCE_LABELS, SYSTEM_PROMPT

#: 캐시가 걸리기 시작하는 길이.
CACHE_MIN_TOKENS = 1024

#: 캐시 구간은 128 토큰 단위로 늘어난다. 1,024 를 넘긴 뒤 1,152 에 닿기 전까지는
#: 남는 만큼을 제값 주고 보내는 셈이라, 그 사이에 있는 것이 가장 이득이다.
CACHE_NEXT_STEP = 1152


def _encoding():
    """실제로 쓰는 모델의 토크나이저. 다른 것으로 세면 숫자가 달라진다.

    한글은 인코딩에 따라 차이가 크다 — 같은 SYSTEM_PROMPT 가 cl100k_base 로는 944,
    o200k_base 로는 630 이다. 모델을 바꾸면 이 테스트가 먼저 알려 준다.
    """
    try:
        return tiktoken.encoding_for_model(OPENAI_MODEL or "")
    except KeyError:
        # 모르는 모델이면 최신 계열의 기본값으로 센다. 환경변수가 비는 CI 도 여기다.
        return tiktoken.get_encoding("o200k_base")


def _tokens() -> int:
    return len(_encoding().encode(SYSTEM_PROMPT))


def test_system_prompt_reaches_the_cache_threshold():
    tokens = _tokens()

    assert tokens >= CACHE_MIN_TOKENS, (
        f"SYSTEM_PROMPT 가 {tokens} 토큰이라 캐시 문턱({CACHE_MIN_TOKENS})에 "
        f"{CACHE_MIN_TOKENS - tokens} 토큰 모자란다. 줄인 만큼 다른 설명을 채우거나, "
        "캐시를 포기한다고 정하고 이 테스트를 지워라."
    )


def test_system_prompt_does_not_overshoot_the_next_step():
    """넘치는 만큼은 캐시 없이 매번 제값이다. 경고에 가깝지만 선을 그어 둔다."""
    tokens = _tokens()

    assert tokens < CACHE_NEXT_STEP, (
        f"SYSTEM_PROMPT 가 {tokens} 토큰이다. {CACHE_NEXT_STEP} 를 채워 다음 캐시 "
        "구간까지 가든지, 아니면 넘는 만큼을 덜어내라."
    )


def test_every_source_label_is_explained_in_the_prompt():
    """출처를 새로 추가하고 프롬프트를 안 고치면 모델이 모르는 이름을 받는다."""
    for label in SOURCE_LABELS.values():
        assert label in SYSTEM_PROMPT, f"'{label}' 이 SYSTEM_PROMPT 에 없다"


def test_the_source_count_in_the_prompt_matches_reality():
    """프롬프트가 '일곱 가지' 라고 못 박아 뒀다. 여덟 번째를 더하면 거짓말이 된다."""
    assert len(SOURCE_LABELS) == 7, (
        f"출처가 {len(SOURCE_LABELS)} 가지가 됐다. generator.py 의 _SOURCE_GLOSSARY "
        "에 적힌 '일곱 가지' 도 같이 고쳐라."
    )
    assert "일곱 가지" in SYSTEM_PROMPT
