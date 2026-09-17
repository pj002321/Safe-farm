"""병해충발생정보 표 둘. 그해 값이라 마스터가 아니다 — seed_bulletins 가 넣는다.

pest_alerts     경보 등급. 정형. "지금 경보 뭐야" 를 SQL 로 답한다 (Phase 4 도구 후보)
pest_bulletins  해충별 설명. 문장. 임베딩 대상

병원균 온도조건(30~35℃)은 여기 없다 — crop_disaster_rules 의 제약과 안 맞아 보류했다.
그쪽은 hazard in ('frost','heat') · op in ('lte','gte') · 값 하나인데, 병원균은
'병해충 · 범위 · 작물 없음' 이라 셋 다 어긋난다. 방제 판정을 설계할 때 따로 만든다.
"""

from sqlalchemy import Column, Date, Identity, Index, Integer, SmallInteger, Text, UniqueConstraint

from app.models.farm.base import FarmBase


class PestAlert(FarmBase):
    __tablename__ = "pest_alerts"

    alert_id = Column(Integer, Identity(always=True), primary_key=True)
    issue_year = Column(SmallInteger, nullable=False)
    issue_no = Column(SmallInteger, nullable=False)
    crop_group = Column(Text, nullable=False)   # 식량작물 · 채소 · 과수 · 시설채소
    level = Column(Text, nullable=False)        # 경보 · 주의보 · 예보
    kind = Column(Text, nullable=False)         # 병 · 해충 · 바이러스
    pest_name = Column(Text, nullable=False)
    # '마늘,양파'. 원본이 13% 만 채워 둔다 — 나머지는 crop_group 으로만 좁힌다
    target_crops = Column(Text, nullable=False, server_default="")
    source_file = Column(Text)

    __table_args__ = (
        UniqueConstraint(
            "issue_year", "issue_no", "crop_group", "level", "kind", "pest_name",
            name="uq_pest_alerts_natural",
        ),
        Index("ix_pest_alerts_issue", "issue_year", "issue_no"),
    )


class PestBulletin(FarmBase):
    __tablename__ = "pest_bulletins"

    bulletin_id = Column(Integer, Identity(always=True), primary_key=True)
    issue_year = Column(SmallInteger, nullable=False)
    issue_no = Column(SmallInteger, nullable=False)
    # 한 항목이 문서상한(2,000자)을 넘으면 줄 경계에서 잘라 ordinal 을 잇는다.
    # 그래서 같은 pest_name 에 ordinal 이 여럿일 수 있다
    ordinal = Column(SmallInteger, nullable=False)
    period_from = Column(Date)
    period_to = Column(Date)
    crop_group = Column(Text, nullable=False)
    pest_name = Column(Text, nullable=False)
    level = Column(Text, nullable=False)
    # crops_in_line 결과. 14% 는 빈 문자열이고 그때는 crop_group 만 단서다
    crop_names = Column(Text, nullable=False, server_default="")
    body = Column(Text, nullable=False)
    source_file = Column(Text)

    __table_args__ = (
        UniqueConstraint(
            "issue_year", "issue_no", "ordinal", name="uq_pest_bulletins_issue_ordinal"
        ),
        Index("ix_pest_bulletins_period", "period_from", "period_to"),
    )
