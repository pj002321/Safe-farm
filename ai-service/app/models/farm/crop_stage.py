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

    # 이 단계에서 필요한 수분(mm).
    # ⚠ **영영 빈 칸이다(2026-09-19).** 원천이 없어 채우지 않는다 — 농작업일정 첨부에
    #   '수분장력' 추출 결과가 0건이고, '관수량' 223건은 전부 시설 관수비용표(㎥/㏊/월)라
    #   단계별 mm 가 아니다. 까닭 전문은 safefarm-crop-data/pipeline/build.py 의 ⚠⚠ 에 있다.
    #   **지우지 않는 까닭** — 저쪽 CSV 계약 헤더에 남아 있어, 여기서 빼면 verify.헤더() 가
    #   터진다. 자료를 나중에 찾으면 되살릴 자리이기도 하다.
    #   대신 아래 세 칸이 그 일을 한다 — 필요량(mm)이 아니라 **시기**로 판정한다.
    water_need_mm = Column(Numeric(5, 1))

    # 이 단계에 시비가 필요한지. 알림을 낼지 판단하는 플래그
    fertilize_needed = Column(Boolean, nullable=False, server_default="false")

    # ★ 2026-09-19 — water_need_mm 의 대체 셋 (crop-data 가 농작업일정에서 뽑아 싣는다)
    #
    # 이 시기에 물이 중요한가. **필요량이 아니라 시기다.**
    # 판정은 여기에 기상 사정(최근 강수 − 증발산 · 예보)을 곱해서 낸다.
    irrigate_needed = Column(Boolean, nullable=False, server_default="false")

    # 이 단계의 농작업 갈래를 쉼표로 이은 것 — '웃거름,김매기,물주기'
    # ⚠ 갈래마다 칸을 만들지 않은 까닭: 갈래가 늘 때마다 스키마가 자라고 두 레포가 같이 움직인다.
    #   쪼개는 것은 읽는 쪽(domain)이 한다. 여기서는 통째로 담는다.
    stage_tasks = Column(Text)

    # 이 단계에 조심할 재해 갈래를 쉼표로 이은 것 — '가뭄,과습,저온'
    # ⚠ crop_disaster_rules 와 **다른 것이다.** 저쪽은 "몇 ℃부터 위험한가"(임계값, 23작물),
    #   이쪽은 "언제 조심하나"(시기, 59작물). 저쪽 CHECK 는 frost/heat 둘뿐이라
    #   가뭄·과습·바람·우박을 담을 수 없다. 둘은 서로의 구멍을 메운다.
    stage_hazards = Column(Text)

    # 이 단계에 사용자에게 보여줄 안내 문구
    guide_text = Column(Text)

    # 구간이 뒤집히거나 폭이 0 인 행을 막는다
    __table_args__ = (CheckConstraint("gdd_from < gdd_to", name="ck_crop_stages_gdd_range"),)
