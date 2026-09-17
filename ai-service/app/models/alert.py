from sqlalchemy import Column, DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.core.db import Base


class OfficialAlert(Base):
    """official_alerts. 매일 배치 스냅샷을 append (CMD 해제/연장 이력 추적용)."""

    __tablename__ = "official_alerts"

    id = Column(Integer, primary_key=True)
    reg_id = Column(String, nullable=False)
    reg_ko = Column(String)
    wrn = Column(String, nullable=False)
    lvl = Column(String)
    tm_fc = Column(String)
    tm_ef = Column(String)
    cmd = Column(String)
    raw = Column(JSONB, nullable=False)
    fetched_at = Column(DateTime, server_default=func.now(), nullable=False)

    # 조회는 언제나 "가장 최근 스냅샷 하나"다(warn_region._latest_active_alerts):
    #   select max(fetched_at) ... / where fetched_at = <그 값>
    # 이 표는 append-only 라 적재 주기를 올리면 계속 커지는데, 인덱스가 없으면
    # 위 두 질의가 매번 풀스캔이 된다 — 그 비용은 **홈 진입마다** 나간다.
    __table_args__ = (Index("ix_official_alerts_fetched_at", "fetched_at"),)
