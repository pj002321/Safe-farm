"""weekly_notes 스키마. 주간농사정보 한 호의 주제 절 하나.

마스터가 아니다 — 매주 호가 는다. seed_bulletins.py 가 넣고 master_seed 는 모른다.
period_from/to 가 있어 "지금 시기" 로 거를 수 있다. 연도는 무시하고 월·일만 견주면
세 해치가 같은 시기에 겹쳐 근거가 세 배가 된다.
"""

from sqlalchemy import Column, Date, Identity, Index, Integer, SmallInteger, Text, UniqueConstraint

from app.models.farm.base import FarmBase


class WeeklyNote(FarmBase):
    __tablename__ = "weekly_notes"

    note_id = Column(Integer, Identity(always=True), primary_key=True)
    issue_year = Column(SmallInteger, nullable=False)
    issue_no = Column(SmallInteger, nullable=False)
    ordinal = Column(SmallInteger, nullable=False)       # 호 안의 절 순서. 자연키의 일부
    period_from = Column(Date)
    period_to = Column(Date)
    topic = Column(Text, nullable=False)                 # '노지고추' '잡초방제'
    # '고추' 또는 '마늘,양파'. 작업 절('잡초방제' 등)은 빈 문자열
    crops = Column(Text, nullable=False, server_default="")
    body = Column(Text, nullable=False)                  # ❍·- 줄. 임베딩 대상
    source_file = Column(Text)

    __table_args__ = (
        UniqueConstraint("issue_year", "issue_no", "ordinal", name="uq_weekly_notes_issue_ordinal"),
        Index("ix_weekly_notes_period", "period_from", "period_to"),
    )
