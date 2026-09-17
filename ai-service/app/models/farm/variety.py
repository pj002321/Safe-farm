"""varieties 스키마. 농사로 품종정보 전체 — 43작물 2,599품종의 카탈로그.

crops(13작물) 와 층이 다르다. crops 는 GDD 계산에 필요한 값이 확정된 작물만,
여기는 원본에 있는 품종 전부다. 그래서 crop_id 가 nullable 이다 — 13작물 밖 품종은
카탈로그 정보만 있고 GDD 엔진에는 안 걸린다.

variant_id 는 "이 품종을 고르면 어느 crop_variants 로 GDD 를 계산하나" 다.
시더가 crop_name + maturity_type 으로 찾아 넣는다. 못 찾으면 NULL.

body 는 첨부 본문(최대 25KB). 임베딩 소스가 이 컬럼을 읽는다(pipeline/doc/sources.py).
"""

from sqlalchemy import CheckConstraint, Column, ForeignKey, Index, Integer, SmallInteger, Text

from app.models.farm.base import FarmBase


class Variety(FarmBase):
    __tablename__ = "varieties"

    # 농사로 cntntsNo. 재수집해도 안 바뀌므로 자연키이자 PK 다. Identity 를 안 쓴다
    variety_no = Column(Text, primary_key=True)

    # '채소' '식량작물' '과수' …
    # ⚠ 본문 txt 폴더 경로에서 꺼내는 값이라 **첨부가 없는 품종은 빈다**(2,599 중 76행).
    #   NOT NULL 로 두면 그 76행이 적재를 통째로 롤백시킨다. NULL 대신 빈 문자열을 쓰는 것은
    #   crop_disaster_rules.stage_name 과 같은 관례다 — 필터가 예측 가능해진다
    crop_group = Column(Text, nullable=False, server_default="")
    crop_name = Column(Text, nullable=False)   # '고추'. crops.name 과 같은 말이지만 FK 는 crop_id 로 건다
    # 세부 계열. '논벼 > 일반벼' 의 2단이다. 2단이 없는 작물이 많아 절반 넘게 빈다(858/2,599)
    variety_group = Column(Text, nullable=False, server_default="")
    name = Column(Text, nullable=False)        # '원강7호(Wongang 7ho)'

    # 원문 숙기와 접은 값. 접기는 safefarm-crop-data 가 한다 — 여기서 다시 접지 않는다
    maturity_raw = Column(Text)
    maturity_type = Column(Text)               # EARLY · MID · LATE · NULL

    use = Column(Text)        # '장류용|두부용'
    zone = Column(Text)       # 적응 지대
    bred_year = Column(SmallInteger)
    breeder = Column(Text)

    summary = Column(Text)    # 주요특성. 임베딩 소스 ①
    body = Column(Text)       # 첨부 본문. 임베딩 소스 ②. 없으면 NULL
    source_file = Column(Text)

    # GDD 엔진과의 연결. 13작물 밖이면 둘 다 NULL
    crop_id = Column(Integer, ForeignKey("crops.crop_id", ondelete="SET NULL"))
    variant_id = Column(Integer, ForeignKey("crop_variants.variant_id", ondelete="SET NULL"))

    __table_args__ = (
        CheckConstraint(
            "maturity_type is null or maturity_type in ('EARLY','MID','LATE')",
            name="ck_varieties_maturity",
        ),
        # "고추 품종 전부" 가 가장 잦은 조회다
        Index("ix_varieties_crop_name", "crop_name"),
    )
