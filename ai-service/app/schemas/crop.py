"""작물 마스터 응답 모양. `/v1/crops` 가 돌려주는 유일한 계약이다.

⚠ **`id` 가 없다.** DB 에 슬러그 컬럼이 없어서다 — `crops.name` 이 한글뿐이다.
  프런트의 `plots.crops` 에는 'cabbage' 같은 영문 슬러그가 저장돼 있어 그대로는
  안 이어진다. 슬러그를 DB 에 넣기로 정하면 그때 필드를 더한다.

⚠ **`difficulty` 값은 '강 · 중 · 약' 이다.** 쉬움·보통·어려움이 아니다 —
  농진청 『텃밭 디자인』의 관리 노력 등급이다(확정표 §H). 화면 문구는 프런트가 정한다.
"""

from pydantic import BaseModel


class CropStageOut(BaseModel):
    """생육단계 한 건. 구간은 반개구간이다 — gdd_from 포함, gdd_to 미포함."""

    stage_order: int
    stage_name: str
    gdd_from: int
    gdd_to: int
    water_need_mm: float | None = None
    fertilize_needed: bool
    guide_text: str | None = None


class CropVariantOut(BaseModel):
    """숙기 한 건. 같은 작물이라도 조생·만생의 목표 적산온도가 다르다."""

    maturity_type: str
    gdd_target: int
    days_to_harvest: int | None = None
    stages: list[CropStageOut]


class CropDisasterRuleOut(BaseModel):
    """재해 경보 기준 한 건.

    한 작물·한 단계에 등급별로 여러 건이 있다 — 고추 개화착과기는
    30℃ 주의 · 32℃ 위험으로 두 건이다.
    """

    hazard: str  # frost | heat
    rule_kind: str  # 동해 · 냉해 · 저온 · 고온해
    stage_name: str  # 비면 작물 전체에 걸린다
    metric: str  # ta_min | ta_max | ta_avg
    op: str  # lte | gte
    threshold_c: float
    duration_days: int | None = None
    severity: str  # 주의 · 위험. 없으면 빈 문자열


class CropSummaryOut(BaseModel):
    """목록용. 밭 등록 화면이 쓴다 — 숙기·단계를 싣지 않는다.

    71행짜리 단계를 선택지 그리는 데 보낼 이유가 없다.
    """

    name: str
    base_temp: float
    upper_temp: float | None = None
    difficulty: str | None = None


class CropDetailOut(CropSummaryOut):
    """상세용. 리포트 화면이 쓴다. 목록에 숙기·단계·재해규칙을 얹은 모양이다."""

    variants: list[CropVariantOut]
    disaster_rules: list[CropDisasterRuleOut]
