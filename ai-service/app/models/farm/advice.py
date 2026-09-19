"""advices / farm_advices 스키마. 정본은 supabase/migrations/20260918000000_advices.sql 이다.

LLM 호출은 하루 한 번만 한다(report.py 의 결정) — 이 두 테이블은 그 결과 캐시다.
GDD·강수·예보 같은 실측값은 여기 안 담는다(부를 때마다 새로 계산), input_snapshot 에만
그날 판단의 근거로 넣어 둔다.

RLS·정책은 마이그레이션에만 있으므로 이 ORM 으로 만든 테이블은 반쪽이다 —
init_farm_db 의 EXTERNAL_TABLES 에 넣어 둔 이유다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.types import Text

from app.models.farm.base import FarmBase


class Advice(FarmBase):
    __tablename__ = "advices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cultivation_id = Column(
        UUID(as_uuid=True), ForeignKey("cultivations.id", ondelete="CASCADE"), nullable=False
    )
    advice_date = Column(Date, nullable=False)

    summary = Column(Text, nullable=False)
    todos = Column(ARRAY(Text), nullable=False, server_default="{}")
    warnings = Column(ARRAY(Text), nullable=False, server_default="{}")
    # 이 조언을 만들 때 쓴 입력값 전체(ReportInput). 이상한 조언이 나왔을 때
    # 어느 계산이 근거였는지 추적하는 용도 — 화면에 되돌려 주지 않는다
    input_snapshot = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (UniqueConstraint("cultivation_id", "advice_date"),)


class FarmAdvice(FarmBase):
    __tablename__ = "farm_advices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # plots.user_id 와 같은 이유로 FK 를 걸지 않는다(auth.users 는 Supabase 소유)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    advice_date = Column(Date, nullable=False)

    summary = Column(Text, nullable=False)
    input_snapshot = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "advice_date"),)
