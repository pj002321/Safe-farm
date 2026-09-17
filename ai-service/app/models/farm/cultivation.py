"""cultivations 스키마. 정본은 supabase/migrations/20260916000000_cultivations.sql 이다.

밭 한 곳에 심은 작물 한 건. 예전에는 plots.crops(text[]) + plots.sowing_date 였는데
"배추를 8월에, 무를 9월에 심었다"를 표현할 수 없어 여기로 뺐다
(20260916010000_plots_drop_crop_columns.sql 이 plots 쪽 컬럼을 지운다).

작물이 아니라 **품종**을 참조한다 — 게이지 분모(crop_variants.gdd_target)와
단계표(crop_stages)가 둘 다 variant_id 에 매달려 있어 crop_id 로는 못 찾는다.

여기 정의는 마이그레이션을 따라 적은 사본이다. RLS·updated_at 트리거·복합 FK 는
마이그레이션에만 있으므로 이 ORM 으로 만든 테이블은 반쪽이다 — init_farm_db 의
EXTERNAL_TABLES 에 넣어 둔 이유다.
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, SmallInteger, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class Cultivation(FarmBase):
    __tablename__ = "cultivations"

    id = Column(UUID(as_uuid=True), primary_key=True)

    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id", ondelete="CASCADE"), nullable=False)

    # 품종이다. 작물이 아니다(위 docstring 참고)
    variant_id = Column(Integer, ForeignKey("crop_variants.variant_id"), nullable=False)

    # 사용자가 붙인 이름. 예: "창가 상추"
    alias = Column(Text)

    # 씨뿌린(또는 정식한) 날. **모를 수 있어서 nullable 이다.**
    # status 가 PLANNED 면 심을 예정일이라 미래 날짜가 들어올 수 있다
    sowing_date = Column(Date)

    # 모종으로 시작했을 때 적산을 시작할 단계. 그 단계의 crop_stages.gdd_from 이
    # 시작 GDD 가 된다 — 씨부터면 비어 있고 0 에서 쌓는다.
    # DB 는 (variant_id, start_stage_order) 복합 FK 로 실재하는 단계인지 막는다
    start_stage_order = Column(SmallInteger)

    # 'SEED' | 'SEEDLING'
    sowing_type = Column(Text, nullable=False, server_default="SEED")

    # 'PLANNED' | 'GROWING' | 'HARVESTED' | 'FAILED'.
    # PLANNED 는 "심을 건데 아직 안 심었다" — sowing_date = null 로 대신하지 않는다
    status = Column(Text, nullable=False, server_default="GROWING")

    # status 가 HARVESTED 일 때만 채운다
    harvested_at = Column(Date)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
