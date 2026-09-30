"""오랜만에 온 사용자에게 밭 걱정거리를 알리는 인사.

`user_id` 는 Next 가 세션에서 꺼내 넘긴다(브라우저 값이 아니다). 여기는 서비스 토큰만 본다.
LLM 을 부르므로 Next 가 사용자별로 캐시한다(`aiService.welcomeBack` 의 revalidateSec).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.service.welcome_back import welcome_back

router = APIRouter(prefix="/v1/welcome-back", tags=["welcome"])


@router.get("/{user_id}", dependencies=[Depends(require_service_token)])
def greet(user_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    return welcome_back(db, user_id)
