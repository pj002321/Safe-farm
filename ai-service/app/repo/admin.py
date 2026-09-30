"""관리자 분석·운영 화면 전용 조회. **쿼리만 한다.** 판정·가공은 `service/` 가 한다.

⚠ **사용자 경로에서 부르지 말 것.** 여기 함수 대부분은 `user_id` 없이 전 사용자를 읽는다
   (질문 트렌드·위험 회원·운영 지표). 다른 repo 가 "user_id 뺀 조회를 만들지 않는다"는
   규칙을 지키는 대신, 전체 조회는 이 파일 한 곳에 모아 둔다 — 부르는 곳이
   `api/admin.py` → `service/*` 뿐인지 grep 한 번으로 확인할 수 있게.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.farm import AskHistory, Crop, CropVariant, Cultivation, PlotTask


# ── 회원 한 명 (회원 분석) ──────────────────────────────────────────────────

def cultivations_with_crop(db: Session, plot_ids: list[uuid.UUID]) -> list[tuple[Cultivation, Crop]]:
    return db.execute(
        select(Cultivation, Crop)
        .join(CropVariant, CropVariant.variant_id == Cultivation.variant_id)
        .join(Crop, Crop.crop_id == CropVariant.crop_id)
        .where(Cultivation.plot_id.in_(plot_ids), Cultivation.deleted_at.is_(None))
    ).all()


def tasks_since(db: Session, plot_ids: list[uuid.UUID], since: datetime, limit: int) -> list[PlotTask]:
    return db.scalars(
        select(PlotTask)
        .where(PlotTask.plot_id.in_(plot_ids), PlotTask.generated_at >= since)
        .order_by(PlotTask.generated_at.desc())
        .limit(limit)
    ).all()


def events_since(db: Session, plot_ids: list[uuid.UUID], since: date, limit: int) -> list:
    # cultivation_events 는 ai-service 모델이 없어 SQL 로 읽는다.
    return db.execute(
        text(
            "select e.kind, e.occurred_on, e.body, e.work_kind from cultivation_events e "
            "join cultivations c on c.id = e.cultivation_id "
            "where c.plot_id = any(:plot_ids) and c.deleted_at is null "
            "and e.occurred_on >= :since "
            "order by e.occurred_on desc limit :limit"
        ),
        {"plot_ids": plot_ids, "since": since, "limit": limit},
    ).all()


def asks_of_user_since(db: Session, user_id: uuid.UUID, since: datetime, limit: int) -> list[AskHistory]:
    return db.scalars(
        select(AskHistory)
        .where(AskHistory.user_id == user_id, AskHistory.created_at >= since)
        .order_by(AskHistory.created_at.desc())
        .limit(limit)
    ).all()


# ── 전 사용자 (질문 트렌드 · 위험 회원 · 브리핑) ──────────────────────────────

def recent_questions(db: Session, since: datetime, exclude_message: str, limit: int) -> list[AskHistory]:
    return db.scalars(
        select(AskHistory)
        .where(AskHistory.created_at >= since, AskHistory.message.is_distinct_from(exclude_message))
        .order_by(AskHistory.created_at.desc())
        .limit(limit)
    ).all()


def last_activity_by_user(db: Session) -> dict[uuid.UUID, datetime]:
    # 밭 등록도 활동으로 센다 — 그래서 밭이 있는 회원은 마지막 활동 시각이 항상 있다.
    return dict(db.execute(text("""
        select user_id, max(at) as last_at from (
            select user_id, created_at as at from plots where deleted_at is null
            union all
            select user_id, created_at from ask_history
            union all
            select p.user_id, e.created_at from cultivation_events e
                join cultivations c on c.id = e.cultivation_id
                join plots p on p.id = c.plot_id
            union all
            select p.user_id, t.done_at from plot_tasks t
                join plots p on p.id = t.plot_id where t.done
        ) a group by user_id
    """)).all())


def open_tasks_by_user(db: Session) -> dict[uuid.UUID, int]:
    """3일 넘게 미완료로 남은 할 일 수."""
    return dict(db.execute(text("""
        select p.user_id, count(*) from plot_tasks t join plots p on p.id = t.plot_id
        where p.deleted_at is null and not t.done and t.expired_at is null
          and t.generated_at < now() - interval '3 days'
        group by p.user_id
    """)).all())


def downs_by_user(db: Session, since: datetime) -> dict[uuid.UUID, int]:
    return dict(db.execute(text("""
        select user_id, count(*) from ask_history
        where rating = 'down' and created_at >= :since group by user_id
    """), {"since": since}).all())


def count_windows(db: Session, table: str, col: str, extra: str, params: dict) -> tuple[int, int]:
    """(:cur 이후 개수, :prev~:cur 개수).

    ⚠ table·col·extra 는 SQL 에 그대로 들어간다. **코드 상수만** 넘길 것
       (`service/briefing.METRICS`). 사용자 입력이 닿으면 SQL 주입이다.
    """
    row = db.execute(
        text(
            f"select count(*) filter (where {col} >= :cur), "
            f"count(*) filter (where {col} < :cur) "
            f"from {table} where {col} >= :prev {extra}"
        ),
        params,
    ).one()
    return row[0], row[1]


# ── 운영 (배치 · 신선도 · 인덱스) ────────────────────────────────────────────

def cron_summary(db: Session) -> list[dict]:
    return [dict(r) for r in db.execute(text("""
        select j.jobname, j.schedule, count(d.runid) as runs,
               count(d.runid) filter (where d.status <> 'succeeded') as failed,
               max(d.start_time) as last_run
        from cron.job j
        left join cron.job_run_details d
          on d.jobid = j.jobid and d.start_time > now() - interval '7 days'
        group by j.jobname, j.schedule order by j.jobname
    """)).mappings()]


def http_responses(db: Session, limit: int = 30) -> list[dict]:
    """pg_net 이 보관 중인 실제 HTTP 결과(몇 시간치)."""
    return [dict(r) for r in db.execute(text("""
        select created, status_code, timed_out, error_msg, left(content, 300) as content
        from net._http_response order by created desc limit :limit
    """), {"limit": limit}).mappings()]


def feed_latest(db: Session) -> dict[str, object]:
    """표별 최신 시각(또는 날짜). 신선도 판정 재료."""
    row = db.execute(text("""
        select (select max(fetched_at) from official_alerts) as alerts,
               (select max(generated_at) from plot_tasks) as tasks,
               (select max(date) from weather_daily) as weather_daily,
               (select max(obs_date) from weather_obs_daily) as weather_obs,
               (select max(obs_date) from satellite_observations) as satellite
    """)).mappings().one()
    return dict(row)


def index_by_source(db: Session) -> list[dict]:
    return [dict(r) for r in db.execute(text("""
        select d.source, count(distinct d.id) as documents, count(c.id) as chunks,
               count(c.embedding) as embedded, max(d.created_at) as latest
        from documents d left join chunks c on c.document_id = d.id
        group by d.source order by d.source
    """)).mappings()]


# ── 예측 정확도 ─────────────────────────────────────────────────────────────

def stage_events(db: Session) -> list[dict]:
    """사용자의 단계 보정(STAGE_SET)·추가(STAGE_ADD). 지운 재배·밭은 뺀다."""
    return [dict(r) for r in db.execute(text("""
        select e.id, e.kind, e.occurred_on, e.stage_order, e.body, e.created_at,
               e.cultivation_id, c.plot_id
        from cultivation_events e
        join cultivations c on c.id = e.cultivation_id and c.deleted_at is null
        join plots p on p.id = c.plot_id and p.deleted_at is null
        where e.kind in ('STAGE_SET', 'STAGE_ADD')
        order by e.occurred_on desc
    """)).mappings()]


def cultivation_by_id(db: Session, cultivation_id: uuid.UUID) -> Cultivation | None:
    return db.get(Cultivation, cultivation_id)
