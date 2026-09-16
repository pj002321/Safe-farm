"""plots 스키마. 정본은 supabase/migrations/20260915000000_plots.sql 이다.

여기 정의는 그 마이그레이션을 따라 적은 사본이다 — 컬럼이 갈리면 마이그레이션 쪽이 맞다.
RLS·updated_at 트리거는 마이그레이션에만 있으므로 이 ORM 으로 만든 테이블은 반쪽이다.
init_farm_db 가 기본으로 건너뛰는 이유다.

auth.users 로 FK 를 걸지 않는 것은 profiles.py 와 같은 이유 — 그 테이블이
Supabase 소유고, auth 없이도 개발 DB 가 혼자 돌아야 해서다.
"""

from sqlalchemy import ARRAY, Boolean, Column, Date, DateTime, Numeric, Text, Integer, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class Plot(FarmBase):
    __tablename__ = "plots"

    id = Column(UUID(as_uuid=True), primary_key=True)

    # 소유자. profiles.id 와 같은 값이지만 FK 는 걸지 않음(위 docstring 참고)
    user_id = Column(UUID(as_uuid=True), nullable=False)

    name = Column(Text)
    area_m2 = Column(Numeric)

    # 최근접 관측소 계산(app/domain/geo.py)의 입력값
    latitude = Column(Numeric, nullable=False)
    longitude = Column(Numeric, nullable=False)

    # 기상청 동네예보 5km 격자. features/monitoring/domain/kmaGrid.ts 가 계산해 넣음
    grid_x = Column(Integer, nullable=False)
    grid_y = Column(Integer, nullable=False)

    region_code = Column(Text, nullable=False)
    region_ko = Column(Text, nullable=False)
    address_ko = Column(Text, nullable=False)

    # Next.js 쪽 영문 slug id 그대로 들어옴("cabbage", "rice") — 한글명 아님
    # (components/plot/crops.tsx 의 CROPS 배열이 원본). Step 4에서 변환한다
    crops = Column(ARRAY(Text), nullable=False, server_default="{}")

    sowing_date = Column(Date)
    sowing_unknown = Column(Boolean, nullable=False, server_default="false")
    sowing_method = Column(Text, nullable=False, server_default="seed")

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())