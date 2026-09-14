from sqlalchemy import Column, DateTime, Integer, String, func
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
