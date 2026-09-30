"""관리자 배치 관리·품질 관리용 운영 현황.

pg_cron(`cron.*`)·pg_net(`net.*`) 스키마는 PostgREST 에 노출되지 않아 Next 가 직접 못 읽는다.
ai-service 는 DB 에 직접 붙으므로 여기서 읽어 넘긴다.

⚠️ `net._http_response` 는 pg_net 이 **몇 시간만** 보관한다. 실제 결과 이력은 그 창 안에서만
   보인다 — 길게 보려면 결과를 우리 표에 옮겨 적는 적재가 필요하다.
"""

from __future__ import annotations

import csv
import json
import threading
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core import ops_log
from app.core.config import EMBED_BATCH_SIZE, KMA_API_KEY, OPENAI_MODEL
from app.core.db import new_session
from app.domain.gdd import station_plot_id
from app.domain.kst import KST
from app.domain.member_insight import Fact, facts_block, verified_findings
from app.domain.ops_status import Feed, hourly_counts, is_stale, job_of, route_stats
from app.knowledge.embedder import embed_texts, get_client
from app.knowledge.vector_store import count_chunks_to_embed, find_chunks_to_embed, save_embeddings
from app.repo import admin as repo
from app.service.plot_tasks import generate_daily_tasks
from pipeline.load_data import load_alerts

def _day_end(d) -> datetime | None:
    # 일 단위 데이터는 그날이 끝난 시각을 최신으로 본다. 자정으로 두면 하루 늦게 stale 이 된다.
    return datetime.combine(d, time.max, KST) if d else None


def _utc(ts: datetime | None) -> datetime | None:
    # official_alerts.fetched_at 은 timezone 없는 컬럼이고 UTC 로 쌓인다.
    return ts.replace(tzinfo=UTC) if ts and ts.tzinfo is None else ts


def collect_feeds(db: Session) -> list[Feed]:
    latest = repo.feed_latest(db)
    return [
        Feed("alerts", "기상특보 스냅샷", "cron alerts-ingest (30분)",
             _utc(latest["alerts"]), 2),
        Feed("tasks", "오늘 할 일 생성", "cron daily-tasks (매일 00:00 KST)",
             latest["tasks"], 26),
        Feed("weather_daily", "지도 기상 실측", "수동 pipeline/region/fetch_region_weather",
             _day_end(latest["weather_daily"]), 48),
        Feed("weather_obs", "밭 상세 기상 관측", "수동 pipeline/farm/sync_station_obs",
             _day_end(latest["weather_obs"]), 48),
        Feed("satellite", "위성 관측(NDVI)", "밭 조회 때 받는 캐시",
             _day_end(latest["satellite"]), None),
    ]


def _http_rows(db: Session) -> list[dict]:
    rows = []
    for r in repo.http_responses(db):
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
        "cron": repo.cron_summary(db),
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
        "rerun": dict(RERUN_STATE),
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
    return {"sources": repo.index_by_source(db)}


# ── 시스템 상태 · 오류 로그 · 외부 API 호출량 ────────────────────────────────

SEVERITY_ORDER = {"error": 0, "warning": 1}


def system_status(db: Session) -> dict:
    now = datetime.now(UTC)
    since = now - timedelta(hours=24)
    requests_24h = [r for r in ops_log.REQUESTS if r[0] >= since]
    outbound_24h = [o for o in ops_log.OUTBOUND if o[0] >= since]

    errors = [
        {"at": at, "severity": sev, "source": src, "message": msg}
        for at, sev, src, msg in ops_log.ERRORS
        if at >= since
    ]
    # 배치 실패는 ai-service 밖(Next·pg_net)에서 나므로 메모리 로그에 없다. pg_net 결과에서 가져온다.
    errors += [
        {"at": r["at"], "severity": "error", "source": f"배치 {r['job'] or '?'}",
         "message": f"HTTP {r['status']} {r['detail']}"}
        for r in _http_rows(db)
        if not r["ok"] and r["at"] >= since
    ]
    errors.sort(key=lambda e: (SEVERITY_ORDER.get(e["severity"], 9), -e["at"].timestamp()))

    hosts: dict[str, list[tuple[datetime, bool]]] = {}
    for at, host, ok in outbound_24h:
        hosts.setdefault(host, []).append((at, ok))

    feeds = collect_feeds(db)
    return {
        "since": max(ops_log.STARTED_AT, since),
        "restartedAt": ops_log.STARTED_AT,
        "requests": {
            "count": len(requests_24h),
            "avgMs": round(sum(r[3] for r in requests_24h) / len(requests_24h)) if requests_24h else None,
            "errors": sum(1 for r in requests_24h if r[2] >= 500),
            "routes": route_stats(requests_24h)[:10],
            "hourly": hourly_counts([r[0] for r in requests_24h], 24, now),
        },
        "outbound": sorted(
            (
                {
                    "host": host,
                    "count": len(calls),
                    "failed": sum(1 for _, ok in calls if not ok),
                    "hourly": hourly_counts([at for at, _ in calls], 24, now),
                }
                for host, calls in hosts.items()
            ),
            key=lambda h: -h["count"],
        ),
        "staleFeeds": [f.label for f in feeds if is_stale(f, now)],
        "errors": errors[:100],
    }


# ── 수동 재실행 ─────────────────────────────────────────────────────────────
# ponytail: 프로세스 안 스레드 하나로 돈다. 재시작하면 진행 중인 작업과 상태가 사라진다.
#   작업이 길어지거나 여러 개를 동시에 돌려야 하면 작업 큐로 옮길 것.

RERUN_JOBS = ("tasks", "alerts", "weather")
WEATHER_MAX_DAYS = 31
_rerun_lock = threading.Lock()
RERUN_STATE: dict = {"job": None, "running": False, "startedAt": None, "finishedAt": None, "result": None}


def _run_weather(db: Session, date_from: date, date_to: date) -> str:
    # pipeline/region/fetch_region_weather 의 적재 루프와 같은 호출. 연 단위가 아니라 기간 단위라 따로 돈다.
    from pipeline.farm import sync_station_obs
    from pipeline.load_data import load_weather_daily
    from pipeline.region.asos import asos_only
    from pipeline.region.fetch_region_weather import STATIONS_PATH

    with STATIONS_PATH.open(encoding="utf-8-sig") as f:
        asos = asos_only(list(csv.DictReader(f)))
    tm1, tm2 = date_from.strftime("%Y%m%d"), date_to.strftime("%Y%m%d")
    rows = sum(
        load_weather_daily(db, station_plot_id(s["stn"]), KMA_API_KEY, s["stn"], 0, 0, tm1, tm2, with_lst=False)
        for s in asos
    )
    sync_station_obs.main()  # 지도용 실측을 밭 상세용 관측 표로 옮긴다(API 호출 0회)
    return f"관측소 {len(asos)}곳 · {rows}일치 적재 후 밭 관측 동기화"


def _rerun(job: str, date_from: date | None, date_to: date | None) -> None:
    db = new_session()
    try:
        if job == "tasks":
            result = f"할 일 {generate_daily_tasks(db)}건 생성"
        elif job == "alerts":
            result = f"특보 {load_alerts(db, KMA_API_KEY)}건 적재"
        else:
            result = _run_weather(db, date_from, date_to)
    except Exception as exc:  # noqa: BLE001 — 스레드 밖으로 못 던진다. 상태와 오류 로그에 남긴다
        ops_log.record_error(f"재실행 {job}", exc)
        result = f"실패: {type(exc).__name__}: {exc}"[:300]
    finally:
        db.close()
    RERUN_STATE.update(running=False, finishedAt=datetime.now(UTC), result=result)
    _rerun_lock.release()


def start_rerun(job: str, date_from: date | None = None, date_to: date | None = None) -> dict:
    """백그라운드로 돌리고 바로 돌아온다. 실행 중이면 거절한다 — 같은 적재가 겹치면 중복 행이 난다."""
    if job not in RERUN_JOBS:
        raise ValueError(f"모르는 작업: {job}")
    if job in ("alerts", "weather") and not KMA_API_KEY:
        raise ValueError("KMA_API_KEY 가 설정되지 않았습니다.")
    if job == "weather":
        if not date_from or not date_to or date_from > date_to:
            raise ValueError("기상 재적재는 시작일·종료일이 필요합니다.")
        if (date_to - date_from).days >= WEATHER_MAX_DAYS:
            raise ValueError(f"기상 재적재는 한 번에 {WEATHER_MAX_DAYS}일까지입니다.")
    if not _rerun_lock.acquire(blocking=False):
        raise ValueError(f"'{RERUN_STATE['job']}' 재실행이 아직 진행 중입니다.")
    RERUN_STATE.update(job=job, running=True, startedAt=datetime.now(UTC), finishedAt=None, result=None)
    threading.Thread(target=_rerun, args=(job, date_from, date_to), daemon=True).start()
    return dict(RERUN_STATE)


# ── 재색인: 임베딩 누락분만 ─────────────────────────────────────────────────
# 전량 재임베딩(`pipeline.doc.embed --full`)은 화면에 두지 않는다. 버튼 한 번에
# 조각 2만여 개 요금이 나가고, 도는 동안 검색이 빈다. 여기서는 빠진 것만 채운다.
EMBED_MISSING_CAP = 2_000


def embed_missing(db: Session) -> dict:
    done = 0
    while done < EMBED_MISSING_CAP and (batch := find_chunks_to_embed(db, limit=EMBED_BATCH_SIZE)):
        save_embeddings(db, batch, embed_texts([c.body for c in batch]))
        done += len(batch)
    remaining = count_chunks_to_embed(db)
    return {"embedded": done, "remaining": remaining}
