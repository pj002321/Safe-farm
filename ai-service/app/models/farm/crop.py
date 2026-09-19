"""crops 스키마. 재배가 직접 참조하지 않는다 — crop_variants 를 거친다.

base_temp·upper_temp 의 정본은 safefarm-crop-data 의 GDD계산관련/작물_확정표.md §B-2 다.
CSV 와 확정표가 다르면 확정표가 맞다 — 이 파일 값을 손으로 고치지 않는다.

crops         감자 공통          base_temp 5.0 · upper_temp 30.0
crop_variants 감자 안의 품종별    gdd_target, days_to_harvest
crop_stages   그 품종의 단계별    water_need_mm, fertilize_needed, guide_text
"""

from sqlalchemy import CheckConstraint, Column, Identity, Integer, Numeric, Text

from app.models.farm.base import FarmBase


class Crop(FarmBase):
    __tablename__ = "crops"

    # DB 가 발급한다. 작물 이름이 바뀌어도 참조가 안 깨지게 자연키를 PK 로 쓰지 않는다
    crop_id = Column(Integer, Identity(always=True), primary_key=True)

    # 작물명. 사용자에게 보이는 이름이자 CSV 적재 때 부모를 찾는 자연키
    name = Column(Text, nullable=False, unique=True)

    # GDD 기준온도(℃). 이 온도 아래에서는 생육이 멈춘 것으로 보고 적산에서 뺀다.
    # 작물마다 달라서 여기 둔다 — GDD 계산의 입력값이다
    #
    # ⚠ nullable 이다(2026-09-17). 이 표의 역할이 "GDD 엔진 테이블" 에서 "작물 사전" 으로
    #   바뀌었기 때문이다 — 농사로 원본의 133작물이 다 들어오는데 확정표 §B-2 가 덮는
    #   기준온도는 16작물뿐이다. 값이 없는 작물은 **GDD 판정만 건너뛰고** 카탈로그·검색·
    #   답변에는 다 나온다.
    #   NOT NULL 이면 117작물이 통째로 안 들어가고, 그러면 varieties·crop_guides 의
    #   crop_id 가 전부 NULL 이 되며 crop_disaster_rules 34행은 부모를 못 찾아 KeyError 다.
    #
    # ⚠ **이 값을 읽어 계산하는 코드는 None 을 먼저 걸러야 한다.** 지금은 그런 경로가 없다
    #   (domain/gdd.py 는 BASE_TEMP_C=5.0 고정값을 쓰는 지역 지도용이다). 작물별 GDD 를
    #   붙일 때 그 함수가 None 을 만나면 그 작물은 계산 대상에서 뺀다
    base_temp = Column(Numeric(4, 1))

    # GDD 상한온도(℃). 이 위로는 발육이 더 빨라지지 않아 (upper − base) 로 잘린다.
    #
    # ⚠ 한계온도(그 위로 죽는다)와 다른 개념이다 — 그건 crop_disaster_rules 로 간다.
    #   방울토마토가 그 차이를 드러낸다: 국내표 35(한계) vs 논문 28~33(상한).
    #
    # nullable 인 이유: 상한을 못 찾은 작물이 들어올 수 있다. 그때는 상한 없이 쌓는다
    # (gdd.ts 의 dailyGdd 가 upperTempC 없으면 Standard 로 간다)
    upper_temp = Column(Numeric(4, 1))

    # 재배 난이도. 초보자에게 작물을 추천할 때 거르는 기준이다.
    #
    # ⚠ **값은 '쉬움 · 보통 · 어려움' 이다.** 2026-09-18 에 '강 · 중 · 약' 에서 바꿨다
    #   (supabase/migrations/20260918000000_crops_difficulty_words.sql).
    #
    #   b812355 에서 칸 이름만 care_level → difficulty 로 바꾸고 값은 원본 척도를 뒀는데,
    #   화면(cropOption.ts toDifficultyLevel)이 '쉬움'→1 · '어려움'→3 만 알아보고 나머지는
    #   전부 2라서 **13작물이 모두 "보통"으로 그려지고 있었다.**
    #
    #   뜻은 그대로 관리 노력이다 — 어려움(거의 매일) · 보통(주 1~2회) · 쉬움(월 1~2회).
    #   b7d5c8a 때 "1차 자료가 없다" 고 적었던 것은 원문을 못 구했기 때문이고,
    #   2026-09-18 에 『텃밭 디자인』 43쪽(자료번호 000000295238)을 확보해 22작물을 직접 읽었다.
    #   §H 에 없는 작물은 safefarm-crop-data 의 pipeline/difficulty.py 가 추정한다.
    #
    # 정본은 safefarm-crop-data 의 작물_확정표.md §H.
    # nullable 인 이유: 이용 부위를 모르는 작물(화훼·버섯·축산·약초 35종)은 비워서 온다
    difficulty = Column(Text)

    __table_args__ = (
        # 확정표를 사람이 고치다 '중하' 같은 딴 척도가 섞여 들어오는 것을 막는다.
        # spec.py 도 같은 검사를 하지만, CSV 를 손으로 고치면 그걸 안 거친다
        CheckConstraint("difficulty in ('쉬움','보통','어려움')", name="ck_crops_difficulty"),
    )
