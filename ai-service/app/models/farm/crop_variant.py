"""crop_variants 스키마. 조생·중생·만생 구분이고, 재배는 이 테이블을 참조한다.

maturity_type 이 3개로 고정은 아니다. 조·중생종 같은 중간 구분이 추가될 수 있다.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)

from app.models.farm.base import FarmBase


class CropVariant(FarmBase):
    __tablename__ = "crop_variants"

    variant_id = Column(Integer, Identity(always=True), primary_key=True)

    # 어느 작물의 품종인지. 작물이 지워지면 품종도 같이 지운다
    crop_id = Column(Integer, ForeignKey("crops.crop_id", ondelete="CASCADE"), nullable=False)

    # 숙기. 같은 작물이라도 조생종이 빨리 익어 목표 GDD 와 단계 구간이 달라진다
    maturity_type = Column(Text, nullable=False)

    # 수확까지 쌓아야 할 누적 GDD. crop_stages 의 마지막 gdd_to 와 같은 값이다
    gdd_target = Column(Integer, nullable=False)

    # 파종부터 수확까지 대략 며칠. 판정은 GDD 로 하고 이건 사용자에게 보여주는 참고값
    days_to_harvest = Column(Integer)

    __table_args__ = (
        # 한 작물에 같은 숙기가 둘일 수 없다. CSV 적재 때 중복 삽입도 여기서 걸린다
        UniqueConstraint("crop_id", "maturity_type", name="uq_crop_variants_crop_maturity"),
        CheckConstraint(
            "maturity_type in ('EARLY','MID','LATE')", name="ck_crop_variants_maturity"
        ),
        # 작물 하나의 품종을 모두 가져오는 조회가 잦다
        Index("ix_crop_variants_crop", "crop_id"),
    )
