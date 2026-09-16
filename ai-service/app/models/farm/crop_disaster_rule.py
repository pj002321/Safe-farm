"""crop_disaster_rules — 작물별 재해 경보 기준.

⚠ `app/models/disaster_rule.py` 의 `disaster_rules` 와 **다른 표다. 섞지 말 것.**

    disaster_rules       station · risk · solar_term · ta_min — 관측소별 기상 통계
                         app.core.db.Base (기상·문서 계열)
    crop_disaster_rules  작물 · 생육단계 · 임계온도 — 작물 생리 기준
                         FarmBase (crops · crop_variants · crop_stages 와 한 묶음)

저쪽이 "언제 그런 날씨가 오나" 를, 이 표가 "그 작물이 그 온도에서 다치나" 를 준다.
둘을 맞춰야 경보가 난다.

★ 지금 이 값들은 프런트에 상수로 박혀 있다 —
  src/features/growth/domain/growthStage.ts 의 frostRiskBelowC · heatRiskAboveC.
  작물당 하나씩이라 생육단계와 등급을 못 담는다. 이 표는 그 둘을 담는다
  (고추 개화착과기는 30℃ 주의 · 32℃ 위험으로 갈린다).

값의 출처: 농사로 API — 재해예방정보 · 주간농사정보 · 농작업일정. 58행 · 12작물.
근거(실린 호 수 · 원문)는 safefarm-crop-data 의 pipeline/out/스키마/근거/ 에 있다.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
)

from app.models.farm.base import FarmBase


class CropDisasterRule(FarmBase):
    __tablename__ = "crop_disaster_rules"

    rule_id = Column(Integer, primary_key=True, autoincrement=True)

    # 부모. CSV 는 자연키(crop_name)로 맞추고 적재 때 crop_id 를 채운다 —
    # crops · crop_variants 와 같은 방식이다
    crop_id = Column(
        Integer, ForeignKey("crops.crop_id", ondelete="CASCADE"), nullable=False
    )

    # 재해 갈래. 프런트 HazardKind(hazards.ts) 와 같은 말을 쓴다.
    #   frost  저온재해 (절기재해 risk=01 · 특보 C 한파)
    #   heat   고온재해 (절기재해 risk=02 · 특보 H 폭염)
    hazard = Column(Text, nullable=False)

    # 같은 frost 안에서도 뜻이 갈린다. 뭉치면 값이 섞인다 —
    # 배추는 동해 -6 과 냉해 -8 이 둘 다 있고 다른 규칙이다.
    #   동해 · 냉해 · 저온(생육단계별) · 고온해
    rule_kind = Column(Text, nullable=False)

    # 생육단계. 비면 작물 전체에 걸린다.
    # crop_stages.stage_name 과 글자가 같지 않을 수 있다 — 원문 표기를 그대로 둔다
    stage_name = Column(Text, nullable=False, server_default="")

    # 무엇을 재나. ta_min · ta_max · ta_avg
    metric = Column(Text, nullable=False)

    # 어느 쪽으로 넘으면 걸리나. lte · gte
    op = Column(Text, nullable=False)

    threshold_c = Column(Numeric(4, 1), nullable=False)

    # 며칠 이어져야 걸리나. 없으면 하루만 넘어도 걸린다
    duration_days = Column(SmallInteger)

    # 등급. 지금은 고온해에만 있다 — 주의 · 위험. 없으면 빈 문자열이다.
    #
    # ⚠ **nullable 로 두면 안 된다.** stage_name 과 같은 까닭이다 — 이 칸도
    #   아래 UNIQUE 에 들어가는데, Postgres 는 NULL 끼리를 서로 다르게 본다.
    #   그러면 등급 없는 규칙(저온해 계열)이 적재할 때마다 새 행으로 쌓인다.
    #   실제로 58행짜리 CSV 를 세 번 넣었더니 142행이 됐다(2026-09-16).
    severity = Column(Text, nullable=False, server_default="")

    __table_args__ = (
        # 한 작물의 같은 규칙·단계·등급이 둘일 수 없다.
        # ⚠ stage_name 을 nullable 로 두면 Postgres 가 NULL 끼리 서로 다르게 보아
        #   UNIQUE 가 헛돈다. 그래서 빈 문자열을 기본값으로 쓴다 —
        #   disaster_rules.crop_id 가 같은 까닭으로 그렇게 하고 있다
        UniqueConstraint(
            "crop_id", "rule_kind", "stage_name", "severity",
            name="uq_crop_disaster_rules_crop_kind_stage_severity",
        ),
        CheckConstraint("hazard in ('frost','heat')", name="ck_crop_disaster_rules_hazard"),
        CheckConstraint("metric in ('ta_min','ta_max','ta_avg')",
                        name="ck_crop_disaster_rules_metric"),
        CheckConstraint("op in ('lte','gte')", name="ck_crop_disaster_rules_op"),
    )
