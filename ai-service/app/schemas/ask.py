"""질문 요청 모양. `ai-service` 로 들어오는 AI 질의응답 입력의 유일한 계약이다.

500자 제한은 여기 한 곳에서만 검사한다 — `ask()` 안에서 따로 `if len(...)` 을
쓰면 두 곳이 어긋날 수 있다.
"""

from pydantic import BaseModel, Field
NO_MATCH_DISTANCE = 1.0

class AskRequest(BaseModel):
    """사용자 질문 한 건. FastAPI가 이 모양대로 body JSON을 검증한다.

    question 이 비어 있거나(0자) 500자를 넘으면 라우터 함수가 실행되기도 전에 422 로 거부된다.
    """
    question: str = Field(...,min_length=1,max_length=500)

class AskMatch(BaseModel):
    """검색된 조각 한 건. source_title 은 이 조각이 속한 문서의 이름, 문서에 제목이 없으면 None."""
    body: str
    distance: float
    source_title: str | None


class AskResponse(BaseModel):
    """`/ask` 가 돌려주는 모양. matches 가 비어 있으면 관련 조각을 하나도 못 찾은 것이다
    (V1-78). message 는 가드레일(V1-77)처럼 검색 대신 고정 문구로 답할 때만 채워진다.
    """
    matches: list[AskMatch]
    message: str | None = None
