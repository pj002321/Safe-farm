"""질문 요청 모양. `ai-service` 로 들어오는 AI 질의응답 입력의 유일한 계약이다.

500자 제한은 여기 한 곳에서만 검사한다 — `ask()` 안에서 따로 `if len(...)` 을
쓰면 두 곳이 어긋날 수 있다.
"""

from pydantic import BaseModel, Field

class AskMatch(BaseModel):
    """검색된 조각 한 건. 지금은 원문 그대로 노출한다 — 출처 표시는 V1-75에서 붙는다."""
    body: str
    distance: float


class AskResponse(BaseModel):
    """`/ask` 가 돌려주는 모양. matches 가 비어 있으면 관련 조각을 하나도 못 찾은 것이다
    (V1-78 에서 이 경우를 "근거 부족" 응답으로 따로 처리한다).
    """
    matches: list[AskMatch]
