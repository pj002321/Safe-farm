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


def growing_in_order(db: Session, plot_id: uuid.UUID) -> list[Cultivation]:
    """
    # summary
    이 밭에서 **지금 기르는** 재배 건 전부. 먼저 심은 것부터.

    `growing_with_crop` 과 달리 작물을 같이 안 읽고 **차례가 있다.** 작업카드가
    재배마다 판정하면서(교안 §2-B) 차례가 필요해졌다 — 밭에 한 장만 내는 재해
    카드를 누구에게 붙일지가 이 차례로 정해진다.

    ⚠ **판정에 못 쓰는 건도 준다.** GDD 를 못 내는 건이라도 빼 버리면 부르는 쪽이
      "그런 작물이 있는 줄도" 모른 채 조용히 사라진다 — **거르는 것은 부르는 쪽
      몫이고, 거를 때 까닭을 남기는 것도 그쪽 몫이다**(`plot_tasks._why_no_growth`).
      실측 2026-09-20: 디테크타워 과천 밭의 **단감**이 그렇다(품종 587 ·
      `crops.base_temp` 가 비어 GDD 를 못 낸다 · 전국 1건).
      파종일이 없는 건도 같은 이유로 준다(전국 0건이지만 막을 장치는 아니다 —
      `sowing_date` 오름차순에서 NULL 은 뒤로 간다).

    ⚠ **id 로 한 번 더 가른다.** 같은 밭에 **파종일까지 같은 재배가 실재한다**
      (2026-09-20 실측: 풋콩 2건 · 피망 2건). 차례가 날마다 뒤집히면 재해 카드가
      어제는 이쪽, 오늘은 저쪽에 붙어 같은 카드가 두 장으로 늘어난다.

    # params
    db: 세션<br>
    plot_id: 밭 id. **소유 확인은 이미 끝났다고 본다**(`repo.plot.owned_plot`)<br>

    # returns
    Cultivation 목록. 아무것도 안 기르면 빈 리스트

    # examples
        [c.sowing_date for c in growing_in_order(db, plot_id)]
        -> [date(2026, 4, 12), date(2026, 6, 1), None]
    """
    return list(
        db.scalars(
            select(Cultivation)
            .where(
                Cultivation.plot_id == plot_id,
                Cultivation.status == "GROWING",
                Cultivation.deleted_at.is_(None),
            )
            .order_by(Cultivation.sowing_date, Cultivation.id)
        )
    )


def lead_growing(db: Session, plot_id: uuid.UUID) -> Cultivation | None:
    """
    # summary
    밭을 대표하는 재배 건 하나 — **가장 먼저 심은 것**.

    화면의 D+n 과 같은 기준이다(`features/plots/domain/plotSummary.ts` 의
    `leadCultivation`). 파종일을 모르는 건은 후보에서 뺀다. 그 건으로는 GDD 를
    못 내는데 대표로 뽑히면 밭 전체가 "생육 근거 없음"이 되기 때문이다.

    ⚠ **조건을 두 벌로 두지 않으려고 `growing_in_order` 를 걸러 쓴다.** 같은
      조회가 여러 벌이 되면 조건이 갈린다 — 이 파일 머리말이 적어 둔, 실제로
      한 번 겪은 사고다. 밭 하나의 재배 건은 몇 줄뿐이라 전부 받아도 싸다.

    # params
    db: 세션<br>
    plot_id: 밭 id<br>

    # returns
    Cultivation 또는 None. 기르는 게 없거나 전부 파종일을 모르면 None

    # examples
        lead_growing(db, plot_id).sowing_date  -> date(2026, 4, 12)
    """
    return next(
        (c for c in growing_in_order(db, plot_id) if c.sowing_date is not None),
        None,
    )
