"""오늘 할 일 카드 생성 엔드포인트(V1-42).

두 경로가 있고, 판정 로직은 같은 함수를 쓴다:

  · POST /generate      — 밭 하나. 밭을 새로 만들거나 재배를 더한 직후, 다음
                          자정까지 기다리지 않고 그 자리에서 카드가 있어야 하는
                          경로다. Next 쪽 registerPlot/addCultivations 가 저장
                          성공 직후 부른다.
  · POST /generate-all  — 모든 밭. 매일 00시(KST) 배치가 부른다. 호출자는
                          Supabase pg_cron → Next /api/cron/tasks 다.

**이 서비스에 공개 도메인을 붙여 크론이 직접 때리게 하지 말 것.** LLM 엔드포인트가
같은 앱에 있어 인터넷에 열면 남이 우리 요금을 쓴다(Dockerfile 주석과 같은 이야기).
크론은 Next 를 치고, Next 가 내부망으로 여기를 부른다.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.repo.plot import live_plot
from app.service.plot_tasks import generate_daily_tasks, generate_tasks_for_plot

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])


@router.post("/generate", dependencies=[Depends(require_service_token)])
def generate_for_plot(plot_id: UUID, db: Session = Depends(get_db)) -> dict:
    """밭 하나만 판정한다. 근거가 없으면 0건일 수 있다 — 정상이다.

    지운 밭(`deleted_at`)은 없는 밭과 같이 다룬다. 삭제가 soft delete 라
    행이 그대로 남아 `db.get()` 으로는 그대로 잡힌다 — 그대로 두면
    숨긴 밭에 `plot_tasks` 가 쌓이고, 그 카드는 지우는 화면이 없다.
    """
    plot = live_plot(db, plot_id)
    if plot is None:
        raise HTTPException(status_code=404, detail="PLOT_NOT_FOUND")

    created = generate_tasks_for_plot(db, plot)
    return {"created": len(created)}


@router.post("/generate-all", dependencies=[Depends(require_service_token)])
def generate_all(db: Session = Depends(get_db)) -> dict:
    """등록된 모든 밭을 판정한다. 매일 00시 배치의 진입점이다.

    밭 하나가 실패해도 나머지를 계속 도는 책임은 generate_daily_tasks 에 있다.
    여기서는 세지 않는다 — 0건은 "판정할 근거가 없었다"는 정상 결과다.

    ponytail: 밭 전체를 한 요청 안에서 동기로 돈다. 밭이 수백 개가 되면 호출자
    타임아웃이 먼저 나므로, 그때 BackgroundTasks 나 작업 큐로 옮긴다.
    """
    return {"created": generate_daily_tasks(db)}
