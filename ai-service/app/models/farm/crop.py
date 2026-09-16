"""crops 스키마. 재배가 직접 참조하지 않는다 — crop_variants 를 거친다.

base_temp·upper_temp 의 정본은 safefarm-crop-data 의 GDD계산관련/작물_확정표.md §B-2 다.
CSV 와 확정표가 다르면 확정표가 맞다 — 이 파일 값을 손으로 고치지 않는다.

crops         감자 공통          base_temp 5.0 · upper_temp 30.0
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

    # GDD 상한온도(℃). 이 위로는 발육이 더 빨라지지 않아 (upper − base) 로 잘린다.
    #
    # ⚠ 한계온도(그 위로 죽는다)와 다른 개념이다 — 그건 crop_disaster_rules 로 간다.
    #   방울토마토가 그 차이를 드러낸다: 국내표 35(한계) vs 논문 28~33(상한).
    #
    # nullable 인 이유: 상한을 못 찾은 작물이 들어올 수 있다. 그때는 상한 없이 쌓는다
    # (gdd.ts 의 dailyGdd 가 upperTempC 없으면 Standard 로 간다)
    upper_temp = Column(Numeric(4, 1))

    # 재배 난이도. 초보자에게 작물을 추천할 때 거르는 기준
    difficulty = Column(Text)