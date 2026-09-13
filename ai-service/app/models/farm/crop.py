"""crops 스키마. 재배가 직접 참조하지 않는다 — crop_variants 를 거친다.

미확인: base_temp 출처가 확인되지 않았다(정의서 회의 확인사항 2번).

crops         감자 공통          base_temp 7.0
crop_variants 감자 안의 품종별    gdd_target, days_to_harvest
crop_stages   그 품종의 단계별    water_need_mm, fertilize_needed, guide_text
"""

from sqlalchemy import Column, Identity, Integer, Numeric, Text

from app.models.farm.base import FarmBase


class Crop(FarmBase):
    __tablename__ = "crops"

    # DB 가 발급한다. 작물 이름이 바뀌어도 참조가 안 깨지게 자연키를 PK 로 쓰지 않는다
    crop_id = Column(Integer, Identity(always=True), primary_key=True)

    # 작물명. 사용자에게 보이는 이름이자 CSV 적재 때 부모를 찾는 자연키
    name = Column(Text, nullable=False, unique=True)

    # GDD 기준온도(℃). 이 온도 아래에서는 생육이 멈춘 것으로 보고 적산에서 뺀다.
    # 작물마다 달라서 여기 둔다 — GDD 계산의 입력값이다
    base_temp = Column(Numeric(4, 1), nullable=False)

    # 재배 난이도. 초보자에게 작물을 추천할 때 거르는 기준
    difficulty = Column(Text)
