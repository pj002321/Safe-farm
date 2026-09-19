"""작물 마스터 조회. **쿼리만 한다 — 가공은 service 가 한다.**

돌려주는 것은 ORM 객체 그대로다. dict 로 바꾸거나 묶는 것은 이 층의 일이 아니다
(AGENTS.md: repo 는 쿼리만, domain 은 가공만, 둘을 합치는 것은 service).

⚠ **복수로 받는다.** 작물 13개의 숙기를 하나씩 조회하면 쿼리가 14번 나간다.
  부모 id 목록을 받아 한 번에 가져오고, 묶는 것은 부르는 쪽이 한다.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.farm import Crop, CropDisasterRule, CropStage, CropVariant


def all_crops(db: Session) -> list[Crop]:
    """
    # summary
    등록된 작물 전부. 밭 등록 화면의 선택지가 이 목록이다.

    # params
    db: 세션<br>

    # returns
    이름순 Crop 목록. 13작물이 들어 있다. 비면 마스터를 아직 안 넣은 것이다

    # examples
        [c.name for c in all_crops(db)]  -> ['감자', '고추', '딸기', ...]
    """
    return list(db.scalars(select(Crop).order_by(Crop.name)))


def crops_by_name(db: Session, names: Sequence[str]) -> list[Crop]:
    """
    # summary
    이름으로 작물을 찾는다. 밭에 심은 작물이 이름으로 넘어오기 때문이다.

    # params
    db: 세션<br>
    names: 작물 이름들. crops.name 은 unique 라 이름이 자연키다<br>

    # returns
    찾은 것만. 없는 이름은 조용히 빠져서 길이가 names 보다 짧을 수 있다 —
    부르는 쪽이 개수를 비교해 "없는 작물" 을 가려낸다

    # examples
        crops_by_name(db, ['배추', '없는것'])  -> [Crop(배추)]
    """
    if not names:
        return []
    return list(db.scalars(select(Crop).where(Crop.name.in_(names))))


def variants_of(db: Session, crop_ids: Sequence[int]) -> list[CropVariant]:
    """
    # summary
    작물들의 숙기 행을 한 번에 가져온다.

    # params
    db: 세션<br>
    crop_ids: 부모 작물 id 들<br>

    # returns
    CropVariant 목록. **작물별로 묶여 있지 않다** — 묶는 것은 service 몫이다.
    한 작물에 EARLY·MID·LATE 가 다 있을 수도, MID 하나뿐일 수도 있다

    # examples
        variants_of(db, [1, 2])  -> [CropVariant(1, MID), CropVariant(2, EARLY), ...]
    """
    if not crop_ids:
        return []
    return list(
        db.scalars(
            select(CropVariant)
            .where(CropVariant.crop_id.in_(crop_ids))
            .order_by(CropVariant.crop_id, CropVariant.maturity_type)
        )
    )


def stages_of(db: Session, variant_ids: Sequence[int]) -> list[CropStage]:
    """
    # summary
    숙기들의 생육단계를 한 번에 가져온다.

    # params
    db: 세션<br>
    variant_ids: 부모 숙기 id 들<br>

    # returns
    stage_order 순 CropStage 목록. 구간은 반개구간이다 —
    gdd_from 포함, gdd_to 미포함. 앞 단계의 gdd_to 와 다음 gdd_from 이 같은 값이다

    # examples
        [s.stage_name for s in stages_of(db, [5])]  -> ['씨뿌림', '아주심기', ...]
    """
    if not variant_ids:
        return []
    return list(
        db.scalars(
            select(CropStage)
            .where(CropStage.variant_id.in_(variant_ids))
            .order_by(CropStage.variant_id, CropStage.stage_order)
        )
    )


def disaster_rules_of(db: Session, crop_ids: Sequence[int]) -> list[CropDisasterRule]:
    """
    # summary
    작물들의 재해 경보 기준을 한 번에 가져온다.

    ⚠ `app/models/disaster_rule.py` 의 `disaster_rules` 와 다른 표다.
      저쪽은 관측소별 절기 기상통계고 이쪽은 작물 생리 기준이다.

    # params
    db: 세션<br>
    crop_ids: 부모 작물 id 들<br>

    # returns
    CropDisasterRule 목록. 한 작물·한 단계에 등급별로 여러 행이 있다 —
    고추 개화착과기는 30℃ 주의 · 32℃ 위험으로 두 행이다

    # examples
        [(r.rule_kind, r.threshold_c) for r in disaster_rules_of(db, [4])]
        -> [('고온해', 30), ('고온해', 32)]
    """
    if not crop_ids:
        return []
    return list(
        db.scalars(
            select(CropDisasterRule)
            .where(CropDisasterRule.crop_id.in_(crop_ids))
            .order_by(CropDisasterRule.crop_id, CropDisasterRule.rule_kind)
        )
    )

# ---------------------------------------------------------------------------
# 아래 넷은 측정 때문에 손으로 채운 것이다. 최적화가 아니다.
#
# `605672c fix: 쿼리를 repo층으로 분리` 가 호출부만 repo 로 돌리고 **함수는 안
# 넣었다.** 그래서 이 커밋(0e8c8d8)은 `app.main` import 부터 실패한다 —
# `service/ask_context.py` 가 stage_at_gdd 를 찾지 못한다. 빠진 함수는 다음
# 커밋(c9c226e)에서야 들어왔다.
#
# 그 c9c226e 본문을 그대로 가져오되 **요청 범위 캐시(`core/request_cache.memo`)를
# 벗겼다.** 캐시는 이 측정이 재려는 대상이므로, 그대로 두면 before 가 after 와
# 같아져 비교가 성립하지 않는다.
# ---------------------------------------------------------------------------


def variant_by_id(db: Session, variant_id: int) -> CropVariant | None:
    """숙기(품종) 한 건. 없으면 None. (c9c226e 이식 · 캐시 제거)"""
    return db.scalars(
        select(CropVariant).where(CropVariant.variant_id == variant_id)
    ).first()


def usable_crop_of_variant(db: Session, variant_id: int) -> Crop | None:
    """숙기가 가리키는 작물. **base_temp 가 비어 있으면 None.** (c9c226e 이식 · 캐시 제거)

    base_temp 는 GDD 의 전제라 없으면 생육을 낼 수 없는데 쓰는 곳이 셋이다
    (daily_gdd_series · crop_interpretation · compute_plot_growth). 호출부마다
    가드를 흩뿌리는 대신 조회 한 곳에서 "쓸 수 없는 작물"로 처리한다.
    """
    variant = variant_by_id(db, variant_id)
    if variant is None:
        return None
    crop = db.scalars(select(Crop).where(Crop.crop_id == variant.crop_id)).first()
    if crop is None or crop.base_temp is None:
        return None
    return crop


def stage_at_gdd(db: Session, variant_id: int, accumulated: float) -> CropStage | None:
    """누적 GDD 가 걸려 있는 생육단계. 단계표를 벗어났으면 None. (c9c226e 이식)

    단계 구간은 `[gdd_from, gdd_to)` 다 — 경계값은 **다음 단계**에 든다.
    """
    return db.scalars(
        select(CropStage).where(
            CropStage.variant_id == variant_id,
            CropStage.gdd_from <= accumulated,
            CropStage.gdd_to > accumulated,
        )
    ).first()


def stage_by_order(db: Session, variant_id: int, stage_order: int) -> CropStage | None:
    """단계 번호로 생육단계 하나. 모종 재배 건의 적산 시작점을 찾는다. (c9c226e 이식 · 캐시 제거)"""
    return db.scalars(
        select(CropStage).where(
            CropStage.variant_id == variant_id,
            CropStage.stage_order == stage_order,
        )
    ).first()
