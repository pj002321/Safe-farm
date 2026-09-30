"""관리자 배치 관리·품질 관리용 운영 현황.

pg_cron(`cron.*`)·pg_net(`net.*`) 스키마는 PostgREST 에 노출되지 않아 Next 가 직접 못 읽는다.
ai-service 는 DB 에 직접 붙으므로 여기서 읽어 넘긴다.

⚠️ `net._http_response` 는 pg_net 이 **몇 시간만** 보관한다. 실제 결과 이력은 그 창 안에서만
   보인다 — 길게 보려면 결과를 우리 표에 옮겨 적는 적재가 필요하다.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, time

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.kst import KST
from app.domain.member_insight import Fact, facts_block, verified_findings
from app.domain.ops_status import Feed, is_stale, job_of
from app.knowledge.embedder import get_client

CRON_SUMMARY_SQL = text("""
    select j.jobname, j.schedule, count(d.runid) as runs,
           count(d.runid) filter (where d.status <> 'succeeded') as failed,
           max(d.start_time) as last_run
    from cron.job j
    left join cron.job_run_details d
      on d.jobid = j.jobid and d.start_time > now() - interval '7 days'
    group by j.jobname, j.schedule order by j.jobname
""")

HTTP_SQL = text("""
    select created, status_code, timed_out, error_msg, left(content, 300) as content
    from net._http_response order by created desc limit 30
""")


def _day_end(d) -> datetime | None:
    # 일 단위 데이터는 그날이 끝난 시각을 최신으로 본다. 자정으로 두면 하루 늦게 stale 이 된다.
    return datetime.combine(d, time.max, KST) if d else None


def _utc(ts: datetime | None) -> datetime | None:
    # official_alerts.fetched_at 은 timezone 없는 컬럼이고 UTC 로 쌓인다.
    return ts.replace(tzinfo=UTC) if ts and ts.tzinfo is None else ts


def collect_feeds(db: Session) -> list[Feed]:
    one = lambda sql: db.execute(text(sql)).scalar()  # noqa: E731
    return [
        Feed("alerts", "기상특보 스냅샷", "cron alerts-ingest (30분)",
             _utc(one("select max(fetched_at) from official_alerts")), 2),
        Feed("tasks", "오늘 할 일 생성", "cron daily-tasks (매일 00:00 KST)",
             one("select max(generated_at) from plot_tasks"), 26),
        Feed("weather_daily", "지도 기상 실측", "수동 pipeline/region/fetch_region_weather",
             _day_end(one("select max(date) from weather_daily")), 48),
        Feed("weather_obs", "밭 상세 기상 관측", "수동 pipeline/farm/sync_station_obs",
             _day_end(one("select max(obs_date) from weather_obs_daily")), 48),
        Feed("satellite", "위성 관측(NDVI)", "밭 조회 때 받는 캐시",
             _day_end(one("select max(obs_date) from satellite_observations")), None),
    ]


def _http_rows(db: Session) -> list[dict]:
    rows = []
    for r in db.execute(HTTP_SQL).mappings():
        ok = r["status_code"] == 200
        detail = None
        if not ok:
            try:
                body = json.loads(r["content"] or "")
                detail = body.get("detail") or body.get("error") if isinstance(body, dict) else None
            except ValueError:
                detail = None
            detail = detail or r["error_msg"] or ("timeout" if r["timed_out"] else (r["content"] or "")[:80])
        rows.append({
            "at": r["created"],
            "job": job_of(r["content"]),
            "status": r["status_code"],
            "ok": ok,
            "detail": detail,
        })
    return rows


def batch_status(db: Session) -> dict:
    now = datetime.now(UTC)
    return {
        "cron": [dict(r) for r in db.execute(CRON_SUMMARY_SQL).mappings()],
        "http": _http_rows(db),
        "feeds": [
            {
                "key": f.key,
                "label": f.label,
                "loader": f.loader,
                "latest": f.latest,
                "maxAgeHours": f.max_age_hours,
                "stale": is_stale(f, now),
            }
            for f in collect_feeds(db)
        ],
    }


DIAGNOSE_PROMPT = (
    "너는 데이터 파이프라인 운영 엔지니어다. [사실]은 스케줄러 실행 결과와 데이터 신선도다. "
    "구조: Supabase pg_cron → pg_net HTTP → Next /api/cron/[job] → ai-service. "
    "cron 의 succeeded 는 요청을 보냈다는 뜻일 뿐이고, 실제 결과는 HTTP 응답이다. "
    "'수동' 적재는 사람이 pipeline 스크립트를 돌려야 채워진다. "
    '원인과 조치를 JSON 으로만 답하라: {"causes": [{"text", "evidence": [사실 id]}], '
    '"actions": [{"text", "evidence": [사실 id]}]}. [사실]에 없는 것은 추측하지 마라.'
)


def diagnose_batches(db: Session) -> dict:
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")
    status = batch_status(db)
    facts: list[Fact] = []
    for r in status["http"]:
        if not r["ok"]:
            facts.append(Fact(
                f"H{len(facts) + 1}",
                f"{r['at']:%m-%d %H:%M} UTC job={r['job'] or '?'} HTTP {r['status']} {r['detail']}",
            ))
    for f in status["feeds"]:
        latest = f"{f['latest']:%Y-%m-%d %H:%M}" if f["latest"] else "없음"
        state = {True: "지연", False: "정상", None: "판정 안 함"}[f["stale"]]
        facts.append(Fact(
            f"D{len(facts) + 1}",
            f"{f['label']} 최신 {latest}, 허용 {f['maxAgeHours']}시간, {state}, 적재: {f['loader']}",
        ))
    for c in status["cron"]:
        facts.append(Fact(
            f"C{len(facts) + 1}",
            f"cron {c['jobname']} ({c['schedule']}) 7일 {c['runs']}회, 실패 {c['failed']}회",
        ))

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": DIAGNOSE_PROMPT},
            {"role": "user", "content": f"[사실]\n{facts_block(facts)}"},
        ],
        response_format={"type": "json_object"},
    )
    data = json.loads(response.choices[0].message.content or "{}")
    known = {f.id for f in facts}
    causes, d1 = verified_findings(data.get("causes"), known)
    actions, d2 = verified_findings(data.get("actions"), known)
    return {
        "causes": causes,
        "actions": actions,
        "dropped": d1 + d2,
        "facts": [{"id": f.id, "text": f.text} for f in facts],
    }


def index_status(db: Session) -> dict:
    rows = db.execute(text("""
        select d.source, count(distinct d.id) as documents, count(c.id) as chunks,
               count(c.embedding) as embedded, max(d.created_at) as latest
        from documents d left join chunks c on c.document_id = d.id
        group by d.source order by d.source
    """)).mappings()
    return {"sources": [dict(r) for r in rows]}
