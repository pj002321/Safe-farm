"""
---------------------------------------------
[Feature]: 금지 주제 가드레일 (순수 함수)

[Description]
- 농약 희석배수·살포량·투여량은 잘못 답하면 실사용 피해로 이어져 LLM 생성 자체를
  막는다. system prompt 지침만으론 새는 사례가 나오므로 키워드 사전 필터를 앞단에 둔다.
- 순수 함수라 DB·LLM 없이 pytest 로 바로 검증된다.

[Usage]
```python
is_blocked_topic("농약 희석배수 얼마나 해?")  # -> True
---
"""

_BLOCKED_KEYWORDS = ("희석배수","살포량","투여량")

BLOCKED_MESSAGE = (
    "농약 희석배수·살포량·투여량은 여기서 답변하지 않습니다. "
    "등록된 사용 기준은 농약안전정보시스템에서 직접 확인해 주세요."
)

def is_blocked_topic(question: str) -> bool:
    """질문에 금지 키워드가 하나라도 있으면 True."""
    return any(keyword in question for keyword in _BLOCKED_KEYWORDS)

