"""plot_tasks 스키마. 정본은 supabase/migrations/20260916010000_plot_tasks.sql 이다.

쓰기(카드 생성)는 ai-service 몫이라(매일 배치가 만드는 주체) ask_history 처럼
init_farm_db 의 EXTERNAL_TABLES 에 넣어 create_all 대상에서는 뺀다 — RLS가 빠진
반쪽 테이블이 생기는 걸 막기 위해서다.

plot_id 는 plots.id 를 가리키지만 FK 는 걸지 않는다 — plot.py 와 같은 이유로,
plots 자체가 이 ORM 밖(마이그레이션)에 정의돼 있어서다. source_document_id 도
documents 테이블(app/models/document.py, 별도 초기화 스크립트 소관)을 느슨하게
참조만 한다.
"""

import uuid

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class PlotTask(FarmBase):
    __tablename__ = "plot_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), nullable=False)

    title = Column(Text, nullable=False)
    # 이 작업이 왜 나왔는지 한 문장. 근거를 못 만들면 카드 자체를 만들지 않는다.
    reason = Column(Text, nullable=False)
    priority = Column(Text, nullable=False)
    source_document_id = Column(UUID(as_uuid=True))

    generated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    done = Column(Boolean, nullable=False, server_default="false")
    done_at = Column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("priority in ('high', 'mid', 'low')", name="plot_tasks_priority_check"),
        Index("ix_plot_tasks_plot_priority", "plot_id", "priority"),
    )
