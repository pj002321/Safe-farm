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
    #
    # ⚠ nullable 이다(2026-09-17). crops.base_temp 와 같은 이유 — 141 숙기 중 목표값이
    #   역산된 것은 21개뿐이다(확정표 §C, 일별 기온 역산이 있어야 나온다).
    #   값이 있는 숙기만 crop_stages 가 딸리므로, 단계가 있으면 목표값도 있다는 관계는
    #   그대로다. 그 짝은 master_seed 의 stage_problems() 가 검사한다
    gdd_target = Column(Integer)

    # 파종부터 수확까지 대략 며칠. 판정은 GDD 로 하고 이건 사용자에게 보여주는 참고값
    days_to_harvest = Column(Integer)

    # 심는 방법. '씨뿌림' · '아주심기' · '모내기' · '파종'.
    # 작물마다 말이 다르다 — 벼는 모내기, 무는 씨뿌림이다. 화면 문구가 이 값을 받는다
    sow_method = Column(Text)

    # 심어도 되는 기간. 'MM-DD' 두 개다(연도 없음 — 해마다 같은 창이 돌아온다).
    #
    # ⚠ **하루가 아니라 창이다.** 확정표 §A 는 '아주심기 8.중~9.상' 처럼 순(旬)으로
    #   적혀 있고, 그 양 끝을 날짜로 편 값이다 — 08-21 ~ 09-10.
    #   순의 중앙일(5·15·25)을 끝으로 쓰면 실제로 심어도 되는 날이 창 밖으로 밀린다.
    #
    # ⚠ gdd_target 역산이 쓰는 파종일과 **다른 값이다.** 저건 중앙일 하나(08-25)이고
    #   이건 기간이다. 역산 쪽을 이 값으로 바꾸면 21개 목표값이 전부 어긋난다
    #   (safefarm-crop-data 의 spec.py `_파종일` 주석).
    #
    # 정본은 safefarm-crop-data 의 작물_확정표.md §A.
    # nullable 인 이유: §A 에 줄이 없는 작물이 들어올 수 있다
    sow_from = Column(Text)
    sow_to = Column(Text)

    # 씨앗으로 심는 창 · 모종으로 옮겨 심는 창. 위 `sow_*` 를 **씨/옮으로 가른 것**이다.
    #
    # ★ 왜 갈랐나 — 등록 폼에 씨앗/모종 라디오가 있는데 안내 문구는 하나뿐이었다.
    #   벼가 그 차이를 드러낸다: 못자리 4.중~5.중, 모내기 5.중~6.중으로 **한 달 떨어져 있다.**
    #   씨앗을 고른 사람에게 모내기 시기를 말하고 있었다(2026-09-18).
    #
    # ⚠ **한쪽이 비는 것이 정상이다.** 직파 작물(감자·당근·시금치·마늘)은 `plant_*` 가 비고,
    #   씨로 안 심는 작물(딸기·생강·토란)은 `seed_*` 가 빈다. 억지로 채우지 않는다.
    #   2026-09-18 기준 122품종 중 둘 다 34 · 씨만 72 · 옮만 10 · 둘 다 없음 6.
    #
    # ⚠ `sow_*` 셋을 **지우지 않았다.** 지금 화면·시더가 그것을 쓴다. 화면이 이 넷으로
    #   옮겨 탄 뒤에 정리한다 — 둘을 한 번에 하면 되돌릴 자리가 없어진다.
    #
    # 정본은 safefarm-crop-data 의 작물_확정표.md §A + 농작업일정 첨부 작형표.
    seed_from = Column(Text)
    seed_to = Column(Text)
    plant_from = Column(Text)
    plant_to = Column(Text)

    __table_args__ = (
        # 한 작물에 같은 숙기가 둘일 수 없다. CSV 적재 때 중복 삽입도 여기서 걸린다
        UniqueConstraint("crop_id", "maturity_type", name="uq_crop_variants_crop_maturity"),
        CheckConstraint(
            "maturity_type in ('EARLY','MID','LATE')", name="ck_crop_variants_maturity"
        ),
        # 작물 하나의 품종을 모두 가져오는 조회가 잦다
        Index("ix_crop_variants_crop", "crop_id"),
    )
