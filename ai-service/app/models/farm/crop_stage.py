"""crop_stages 스키마. 구간은 반개구간이다 — gdd_from 포함, gdd_to 미포함.

미결정: 같은 variant 안에서 구간이 겹치는 걸 DB 가 막으려면 btree_gist 가 필요한데
Supabase 에서 켤 수 있는지 확인되지 않았다. 그때까지는 애플리케이션에서 검증한다.
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    Text,
)

from app.models.farm.base import FarmBase


class CropStage(FarmBase):
    __tablename__ = "crop_stages"

    variant_id = Column(
        Integer, ForeignKey("crop_variants.variant_id", ondelete="CASCADE"), primary_key=True
    )

    # 단계 순서(1부터). variant_id 와 묶어 PK 라, 같은 품종에 같은 순서가 둘일 수 없다
    stage_order = Column(SmallInteger, primary_key=True)

    # 단계 이름(발아기·개화기 등). 사용자에게 현재 상태로 보여준다
    stage_name = Column(Text, nullable=False)

    # 이 단계가 시작되는 누적 GDD. 이 값 포함
    gdd_from = Column(Integer, nullable=False)

    # 다음 단계가 시작되는 누적 GDD. 이 값 미포함.
    # 앞 단계의 gdd_to 와 다음 단계의 gdd_from 이 같은 값이라 경계에서 두 번 걸리지 않는다
    gdd_to = Column(Integer, nullable=False)

    # 이 단계에서 필요한 수분(mm). 예보 강수량과 비교해 관수 안내를 낼 때 쓴다.
    # crops 가 아니라 여기 있는 건 단계마다 필요량이 달라서다
    water_need_mm = Column(Numeric(5, 1))

    # 이 단계에 시비가 필요한지. 알림을 낼지 판단하는 플래그
    fertilize_needed = Column(Boolean, nullable=False, server_default="false")

    # 이 단계에 사용자에게 보여줄 안내 문구
    guide_text = Column(Text)

    # 구간이 뒤집히거나 폭이 0 인 행을 막는다
    __table_args__ = (CheckConstraint("gdd_from < gdd_to", name="ck_crop_stages_gdd_range"),)
