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

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.domain.task_rules import RAIN_WINDOW_DAYS, PlotTaskInputs, build_task_candidates
from app.models.farm import Plot, PlotTask, WeatherObsDaily
from app.service.plot_growth import compute_plot_growth, nearest_station

#: 안 하고 넘어간 카드를 닫기까지의 일수.
#:
#: ⚠️ **화면의 이월 기간과 같은 값이어야 한다**
#:    (Next: features/dashboard/domain/taskSummary.ts 의 CARRY_OVER_DAYS).
#:    두 값이 어긋나면 둘 중 하나가 일어난다 —
#:      · 여기가 더 길면: 화면에서 사라진 카드가 생성을 계속 막는다(가뭄이 이어져도
#:        물 주기 카드가 안 뜬다). 이 상수를 만든 이유가 바로 이것이다.
#:      · 여기가 더 짧으면: 화면에 "3일째"로 남아 있는 카드가 이미 닫혀서,
#:        같은 제목의 새 카드가 그 옆에 하나 더 뜬다.
EXPIRE_AFTER_DAYS = 3

#: 한국 표준시. 서머타임이 없어 고정 오프셋으로 둔다.
_KST = timezone(timedelta(hours=9))


def _expire_cutoff(now: datetime | None = None) -> datetime:
    """이 시각보다 먼저 만들어진 미완료 카드를 닫는다.

    오늘(KST) 00:00 에서 EXPIRE_AFTER_DAYS 만큼 거슬러 간 시각이다. **날짜 경계로
    자르는 것이 핵심이다** — "지금부터 72시간 전"으로 하면 배치가 도는 시각이
    몇 분만 밀려도 경계에 걸친 카드가 어떤 날은 닫히고 어떤 날은 안 닫힌다.
    """
    kst_now = (now or datetime.now(timezone.utc)).astimezone(_KST)
    kst_day_start = kst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return kst_day_start - timedelta(days=EXPIRE_AFTER_DAYS)


def expire_stale_tasks(db: Session, plot_id, now: datetime | None = None) -> int:
    """밭 하나의 오래된 미완료 카드를 닫고, 닫은 개수를 돌려준다.

    지우지 않는다 — "안 하고 넘어갔다"는 사실이 이력이다. 이미 닫힌 카드는 다시
    건드리지 않는다(expired_at is null 조건).
    """
    result = db.execute(
        update(PlotTask)
        .where(
            PlotTask.plot_id == plot_id,
            PlotTask.done.is_(False),
            PlotTask.expired_at.is_(None),
            PlotTask.generated_at < _expire_cutoff(now),
        )
        .values(expired_at=func.now())
    )
    return result.rowcount or 0


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
    """밭 하나를 판정해 새 카드를 만든다.

    **먼저 오래된 미완료 카드를 닫는다.** 순서가 중요하다 — 닫기 전에 판정하면
    그 카드가 아직 "열린 제목"이라 같은 카드의 재생성을 막는다. 사용자는 홈에서
    그 카드를 이미 못 보고 있으므로, 조건이 여전한데도 할 일이 없는 것처럼 보인다.

    닫고 난 뒤에도 살아 있는(미완료·미만료) 같은 제목의 카드가 있으면 새로 만들지
    않는다. 배치를 하루에 여러 번 돌려도 카드가 중복 쌓이지 않게 하는 장치다.
    """
    expire_stale_tasks(db, plot.id)

    # ⚠️ 아래 조기 return 들은 **만료를 커밋한 뒤** 나가야 한다. 관측소나 생육
    #    정보가 없는 밭이라고 해서 오래된 카드를 계속 열어 둘 이유는 없다.
    station = nearest_station(db, plot)
    if station is None:
        db.commit()
        return []

    growth = compute_plot_growth(db, plot, station)
    if growth is None:
        db.commit()
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
        db.commit()
        return []

    # "살아 있는" 카드만 재생성을 막는다 — 닫힌 카드(expired_at)는 세지 않는다.
    # 이 조건을 빠뜨리면 만료 처리 자체가 무의미해진다.
    existing_open_titles = {
        title
        for (title,) in db.execute(
            select(PlotTask.title).where(
                PlotTask.plot_id == plot.id,
                PlotTask.done.is_(False),
                PlotTask.expired_at.is_(None),
            )
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

    # 만료 처리는 새 카드가 하나도 안 나와도 반영돼야 한다 — 조건이 해소돼서
    # 후보가 없는 경우에도 오래된 카드는 닫혀야 한다. 그래서 무조건 커밋한다.
    db.commit()
    return created


def generate_daily_tasks(db: Session) -> int:
    """살아 있는 밭을 판정한다. 배치 스크립트(pipeline)가 부르는 진입점.

    삭제는 soft delete 라 지운 밭도 `plots` 에 그대로 남아 있다(`deleted_at`).
    거르지 않으면 지운 밭에 매일 카드가 새로 쌓인다 — 화면에는 Next 쪽 조인
    조건(`taskStore.listTaskCards` 의 `plots.deleted_at is null`)이 가려 주므로
    보이지 않고, 그래서 더 늦게 발견된다. ask_context.py 와 같은 조건이다.
    """
    plots = db.query(Plot).filter(Plot.deleted_at.is_(None)).all()
    return sum(len(generate_tasks_for_plot(db, plot)) for plot in plots)
