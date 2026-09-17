"""밭 하나를 즉시 판정해 오늘 할 일 카드를 만든다(V1-42).

자정 배치(pipeline, 아직 없음)는 모든 밭을 도는 스케줄러 몫이다. 이 엔드포인트는
그것과 별개로, 밭을 새로 만들거나 재배를 더한 직후 다음 자정까지 기다리지 않고
그 자리에서 카드가 있어야 하는 경로다 — Next 쪽 registerPlot/addCultivations 가
저장 성공 직후 이걸 부른다.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.models.farm import Plot
from app.service.plot_tasks import generate_tasks_for_plot

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])


@router.post("/generate", dependencies=[Depends(require_service_token)])
def generate_for_plot(plot_id: UUID, db: Session = Depends(get_db)) -> dict:
    """밭 하나만 판정한다. 근거가 없으면 0건일 수 있다 — 정상이다.

    지운 밭(`deleted_at`)은 없는 밭과 같이 다룬다. 삭제가 soft delete 라
    행이 그대로 남아 `db.get()` 으로는 그대로 잡힌다 — 그대로 두면
    숨긴 밭에 `plot_tasks` 가 쌓이고, 그 카드는 지우는 화면이 없다.
    """
    plot = db.query(Plot).filter(Plot.id == plot_id, Plot.deleted_at.is_(None)).first()
    if plot is None:
        raise HTTPException(status_code=404, detail="PLOT_NOT_FOUND")

    created = generate_tasks_for_plot(db, plot)
    return {"created": len(created)}
