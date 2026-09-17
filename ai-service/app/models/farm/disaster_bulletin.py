"""disaster_bulletins 스키마. 재해예방 월간회보의 【사전대책】【사후대책】 블록.

crop_disaster_rules 와 다른 층이다 — 저건 "32℃ 이상 위험" 임계값(정형, GDD 엔진이 판정),
이건 "그래서 뭘 하나" 문장(임베딩, 답변 근거). 임계값이 판정을 내면 이 문장이 조언이 된다.

월 단위다. period 가 아니라 issue_month 하나 — "5월 우박 대책" 은 해마다 같은 달에 되풀이된다.
"""

from sqlalchemy import Column, Identity, Index, Integer, SmallInteger, Text, UniqueConstraint

from app.models.farm.base import FarmBase


class DisasterBulletin(FarmBase):
    __tablename__ = "disaster_bulletins"

    bulletin_id = Column(Integer, Identity(always=True), primary_key=True)
    issue_year = Column(SmallInteger, nullable=False)
    issue_month = Column(SmallInteger, nullable=False)
    ordinal = Column(SmallInteger, nullable=False)
    hazard = Column(Text, nullable=False)                 # 우박 · 강풍 · 황사 · 집중호우 …
    crop_names = Column(Text, nullable=False, server_default="")   # 총론 블록은 빈 문자열
    phase = Column(Text, nullable=False)                  # 사전대책 · 사후대책 · 강풍발생전 …
    body = Column(Text, nullable=False)
    source_file = Column(Text)

    __table_args__ = (
        UniqueConstraint(
            "issue_year", "issue_month", "ordinal", name="uq_disaster_bulletins_issue_ordinal"
        ),
        Index("ix_disaster_bulletins_hazard", "hazard"),
    )
