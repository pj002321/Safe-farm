"""ask_history 스키마. 정본은 supabase/migrations/20260916000000_ask_history.sql 이다.

쓰기는 ai-service 몫이라(질문 이력을 남기는 주체가 /v1/ask 자신) profiles 처럼
init_farm_db 의 EXTERNAL_TABLES 에 넣어 create_all 대상에서는 뺀다 — RLS가 빠진
반쪽 테이블이 생기는 걸 막기 위해서다.

user_id 는 auth.users 가 아니라 profiles.id 로 FK 를 건다 — profile.py 와 같은
이유로, auth 스키마 없이도 개발 DB 가 혼자 돌아야 해서다.
"""

import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class AskHistory(FarmBase):
    __tablename__ = "ask_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)

    question = Column(Text, nullable=False)
    answer = Column(Text)
    # 가드레일 차단·검색 결과 없음일 때 answer 대신 채우는 고정 문구
    message = Column(Text)
    # 답변 평가. null = 아직 평가 안 함
    rating = Column(Text)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("rating in ('up', 'down')", name="ask_history_rating_check"),
        Index("ix_ask_history_user_created", "user_id", "created_at"),
    )
