"""질문 요청 모양. `ai-service` 로 들어오는 AI 질의응답 입력의 유일한 계약이다.

500자 제한은 여기 한 곳에서만 검사한다 — `ask()` 안에서 따로 `if len(...)` 을
쓰면 두 곳이 어긋날 수 있다.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, Field

NO_MATCH_DISTANCE = 1.0

#: 피드백 사유 길이 상한. 자유 입력이라 길이를 안 막으면 본문 전체가 들어온다.
FEEDBACK_REASON_MAX = 200

class AskRequest(BaseModel):
    """사용자 질문 한 건. FastAPI가 이 모양대로 body JSON을 검증한다.

    question 이 비어 있거나(0자) 500자를 넘으면 라우터 함수가 실행되기도 전에 422 로 거부된다.
    user_id 는 이력 저장·일일 한도 계산의 키다 — Next.js 가 세션 쿠키로 확인한 값을 그대로 싣는다.
    plot_id 는 선택이다 — 없으면 예전처럼 밭 컨텍스트 없이 답한다(app/service/ask_context.py).
    """
    question: str = Field(...,min_length=1,max_length=500)
    user_id: uuid.UUID
    plot_id: uuid.UUID | None = None

class AskMatch(BaseModel):
    """검색된 조각 한 건. source_title 은 이 조각이 속한 문서의 이름, 문서에 제목이 없으면 None."""
    body: str
    distance: float
    source_title: str | None


class AskQuota(BaseModel):
    """오늘 남은 질문 횟수. 화면이 묻기 전에 미리 보여주고, 0 이면 입력을 막는다.

    limit 을 함께 내려보내는 이유는 "3/10" 처럼 분모를 찍기 위해서다. 웹이 상한을
    제 나름대로 알고 있으면 env 로 값을 올렸을 때 화면만 옛 숫자를 말한다.
    """
    limit: int
    used: int
    remaining: int


class AskResponse(BaseModel):
    """`/ask` 가 돌려주는 모양. matches 가 비어 있으면 관련 조각을 하나도 못 찾은 것이다
    (V1-78). message 는 가드레일(V1-77)·일일 한도 초과처럼 검색 대신 고정 문구로 답할
    때만 채워진다. answer 는 matches 를 근거로 LLM 이 생성한 답변 — matches 가 비어
    있으면 근거가 없으므로 채우지 않는다. history_id 는 ask_history 에 남긴 행의 id —
    피드백(/v1/ask/{history_id}/feedback)을 보낼 때 이 값을 쓴다.

    quota 는 이 요청을 처리한 뒤의 잔여 횟수다. 화면이 답변과 같은 응답에서 받아야
    "방금 한 번 썼다"를 곧바로 반영할 수 있다.
    """
    matches: list[AskMatch]
    answer: str | None = None
    message: str | None = None
    history_id: str | None = None
    quota: AskQuota | None = None


class AskSuggestions(BaseModel):
    """초기 화면에 띄울 추천 질문. basis 는 이 질문들이 어디서 나왔는지(작물·생육단계)
    를 적은 한 줄 — 밭을 고르지 않았으면 None 이고 questions 는 일반 질문이 된다.
    """
    questions: list[str]
    basis: str | None = None


class AskFeedbackRequest(BaseModel):
    """답변 하나에 대한 평가.

    rating 은 up/down 두 값만 받는다. reason 은 선택이며, 검색 품질을 고칠 단서가
    되는 건 "왜 도움이 안 됐나" 쪽이라 down 에서만 의미가 있다 — 다만 여기서 그걸
    강제하지는 않는다. 개인정보가 섞여 들어올 수 있는 자유 입력이라 길이를 막는다.
    """
    user_id: uuid.UUID
    rating: Literal["up", "down"]
    reason: str | None = Field(None, max_length=FEEDBACK_REASON_MAX)
