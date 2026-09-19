"""재배 건(`farm.cultivations`) 조회. **쿼리만 한다.**

모델 주석이 "조회는 전부 `deleted_at is null` 을 걸어야 한다"고 적어 두었는데,
`service/plot_growth.py` 의 대표 재배 건 조회에는 그 조건이 **빠져 있었다.**
같은 밭을 `/ask` 는 지운 작물을 빼고 보고, 리포트·할 일 카드는 지운 작물로 GDD 를
쌓았다 — 화면 두 곳이 다른 작물 이름을 말하는데 어느 쪽도 틀렸다고 말해 주지
않는다. 조회를 여기로 모으면서 같이 맞췄다.

⚠ **`status` 도 여기서 건다.** `GROWING` 이 아닌 건(PLANNED·HARVESTED·FAILED)은
  "지금 뭘 해야 하나"에 답하는 자리의 재료가 아니다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.farm import Crop, CropVariant, Cultivation


def growing_with_crop(db: Session, plot_id: uuid.UUID) -> list[tuple[Cultivation, Crop]]:
    """
    # summary
    이 밭에서 **지금 기르는** 재배 건과 그 작물. 심은 순서는 정하지 않는다.

    `cultivations` 는 작물이 아니라 품종을 참조하므로 `crop_variants` 를 거쳐
    `crops` 까지 두 번 조인한다. 밭 하나에 작물이 여럿이라 한 번에 받아 온다 —
    재배 건마다 작물을 따로 조회하면 밭 카드 한 장에 쿼리가 재배 건 수만큼 는다.

    # params
    db: 세션<br>
    plot_id: 밭 id. **소유 확인은 이미 끝났다고 본다**(`repo.plot.owned_plot`)<br>

    # returns
    (Cultivation, Crop) 목록. 아무것도 안 기르는 밭이면 빈 리스트

    # examples
        [c.name for _, c in growing_with_crop(db, plot_id)]  -> ['감자', '상추']
    """
    return list(
        db.execute(
            select(Cultivation, Crop)
            .join(CropVariant, CropVariant.variant_id == Cultivation.variant_id)
            .join(Crop, Crop.crop_id == CropVariant.crop_id)
            .where(
                Cultivation.plot_id == plot_id,
                Cultivation.status == "GROWING",
                Cultivation.deleted_at.is_(None),
            )
        ).all()
    )


def lead_growing(db: Session, plot_id: uuid.UUID) -> Cultivation | None:
    """
    # summary
    밭을 대표하는 재배 건 하나 — **가장 먼저 심은 것**.

    화면의 D+n 과 같은 기준이다(`features/plots/domain/plotSummary.ts` 의
    `leadCultivation`). 파종일을 모르는 건은 후보에서 뺀다. 그 건으로는 GDD 를
    못 내는데 대표로 뽑히면 밭 전체가 "생육 근거 없음"이 되기 때문이다.

    # params
    db: 세션<br>
    plot_id: 밭 id<br>

    # returns
    Cultivation 또는 None. 기르는 게 없거나 전부 파종일을 모르면 None

    # examples
        lead_growing(db, plot_id).sowing_date  -> date(2026, 4, 12)
    """
    return db.scalars(
        select(Cultivation)
        .where(
            Cultivation.plot_id == plot_id,
            Cultivation.status == "GROWING",
            Cultivation.deleted_at.is_(None),
            Cultivation.sowing_date.isnot(None),
        )
        .order_by(Cultivation.sowing_date)
    ).first()
