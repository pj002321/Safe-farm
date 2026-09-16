"""필지별 작업카드 생성. 매일 00시 배치(아직 스케줄러가 없어 Step 미정, pipeline
스크립트로 수동 실행)가 이 모듈의 `generate_daily_tasks` 를 부른다. 00시인 이유는
농부들이 새벽부터 일을 시작해서다 — 밭에 나갈 때 이미 그날 카드가 있어야 한다.

매주가 아니라 매일 판정하는 이유: 강수량 같은 판정 기준이 날마다 바뀐다. 주 1회만
갱신하면 화·수에 비가 와도 금요일 카드엔 반영되지 않는다. `existing_open_titles`
가 막아 주므로 매일 돌려도 미완료 카드가 중복 생기지는 않는다.

판정 자체(무슨 카드를 만들지)는 app/domain/task_rules.py 순수 함수가 한다. 여기는
DB에서 값을 모아 넘기고, 나온 후보를 plot_tasks 테이블에 적재하기만 한다.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.task_rules import RAIN_WINDOW_DAYS, PlotTaskInputs, build_task_candidates
from app.models.farm import Plot, PlotTask, WeatherObsDaily
from app.service.plot_growth import compute_plot_growth, nearest_station


def _recent_rain_mm(db: Session, station_code: str) -> float | None:
    """최근 RAIN_WINDOW_DAYS 일 누적 강수량. 관측이 하나도 없으면 None(판정 보류)."""
    since = date.today() - timedelta(days=RAIN_WINDOW_DAYS)
    rows = db.execute(
        select(WeatherObsDaily.rainfall_mm).where(
            WeatherObsDaily.station_code == station_code,
            WeatherObsDaily.obs_date >= since,
        )
    ).scalars().all()
    values = [float(r) for r in rows if r is not None]
    return sum(values) if values else None


def generate_tasks_for_plot(db: Session, plot: Plot) -> list[PlotTask]:
    """밭 하나를 판정해 새 카드를 만든다. 이미 미완료 상태로 같은 제목의 카드가
    있으면 다시 만들지 않는다 — 실제 크론이 붙기 전까지 수동으로 여러 번 돌려도
    카드가 중복 쌓이지 않게 하는 최소 안전장치다.
    """
    station = nearest_station(db, plot)
    if station is None:
        return []

    growth = compute_plot_growth(db, plot, station)
    if growth is None:
        return []

    inputs = PlotTaskInputs(
        crop_name_ko=growth.crop_name_ko,
        stage_name=growth.stage_name,
        water_need_mm=growth.water_need_mm,
        recent_rain_mm=_recent_rain_mm(db, station.station_code),
        fertilize_needed=growth.fertilize_needed,
    )
    candidates = build_task_candidates(inputs)
    if not candidates:
        return []

    existing_open_titles = {
        title
        for (title,) in db.execute(
            select(PlotTask.title).where(PlotTask.plot_id == plot.id, PlotTask.done.is_(False))
        ).all()
    }

    created: list[PlotTask] = []
    for candidate in candidates:
        if candidate.title in existing_open_titles:
            continue
        task = PlotTask(
            plot_id=plot.id,
            title=candidate.title,
            reason=candidate.reason,
            priority=candidate.priority,
        )
        db.add(task)
        created.append(task)

    if created:
        db.commit()
    return created


def generate_daily_tasks(db: Session) -> int:
    """모든 밭을 판정한다. 배치 스크립트(pipeline)가 부르는 진입점."""
    plots = db.query(Plot).all()
    return sum(len(generate_tasks_for_plot(db, plot)) for plot in plots)
