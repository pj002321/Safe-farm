from sqlalchemy import Column, Float, Integer, String, UniqueConstraint

from app.core.db import Base


class DisasterRule(Base):
    """disaster_rules — 절기재해 기준값(다년 평균).

    station 은 DATA_SCHEMA.md 에 없지만 응답이 관측소 단위라 추가했다(실측 확인).
    crop_id 는 "작물 무관"을 빈 문자열로 표시한다 — nullable 로 두면 Postgres
    UNIQUE 제약에서 NULL 끼리 서로 다르게 취급되어 upsert 멱등성이 깨진다.
    """

    __tablename__ = "disaster_rules"
    __table_args__ = (
        UniqueConstraint("station", "risk", "solar_term", "crop_id", name="uq_disaster_rules_station_risk_term_crop"),
    )

    id = Column(Integer, primary_key=True)
    station = Column(String, nullable=False)
    risk = Column(String, nullable=False)  # "01".."05"
    solar_term = Column(String, nullable=False)  # "01".."24"
    crop_id = Column(String, nullable=False, default="")
    ta_min = Column(Float)
    tg_min = Column(Float)  # 초상온도 — 서리 판정의 핵심값 (risk=01 전용)
    sample_years = Column(Integer)
