"""crop_guides 스키마. 농작업일정 첨부의 재배법·재해대책·생리특성 문장. 작물당 여러 덩이.

crop_stages.guide_text 와 다른 층이다 — 저건 GDD 단계 하나에 한 줄(화면의 단계 카드),
이건 절 단위 문장 전부(검색·답변 근거). 같은 문장이 양쪽에 있을 수 있고 그래도 된다.

crop_id 가 nullable 인 이유: 농작업일정에는 100여 작물이 있고 crops 에는 GDD 값이
확정된 13작물뿐이다. 13작물 밖 문장도 검색에는 나와야 한다.
"""

from sqlalchemy import CheckConstraint, Column, ForeignKey, Identity, Index, Integer, Text, UniqueConstraint

from app.models.farm.base import FarmBase

SECTIONS = ("재배법", "기상재해대책", "생리적특성")


class CropGuide(FarmBase):
    __tablename__ = "crop_guides"

    guide_id = Column(Integer, Identity(always=True), primary_key=True)

    crop_name = Column(Text, nullable=False)          # 한글 표준이름. varieties.crop_name 과 같은 말
    cultivation_type = Column(Text, nullable=False, server_default="")   # '보통재배'. 없으면 빈 문자열 — NULL 이면 UNIQUE 가 헛돈다
    section = Column(Text, nullable=False)            # SECTIONS 중 하나
    topic = Column(Text, nullable=False)              # '모 기르기'
    body = Column(Text, nullable=False)               # 임베딩 대상
    source_file = Column(Text)
    source_loc = Column(Text)

    crop_id = Column(Integer, ForeignKey("crops.crop_id", ondelete="SET NULL"))

    __table_args__ = (
        UniqueConstraint("crop_name", "cultivation_type", "section", "topic",
                         name="uq_crop_guides_natural"),
        CheckConstraint(f"section in {SECTIONS}", name="ck_crop_guides_section"),
        Index("ix_crop_guides_crop_name", "crop_name"),
    )
