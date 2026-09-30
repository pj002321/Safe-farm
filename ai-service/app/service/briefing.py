"""서비스 기록을 이번 주/지난주로 세어 LLM 에 운영 브리핑을 쓰게 한다."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.api.diagnose import DIAGNOSE_MARK
from app.core.config import OPENAI_MODEL
from app.domain.briefing import WINDOW_DAYS, Metric, metrics_block, parse_briefing
from app.domain.guardrail import BLOCKED_MESSAGE
from app.domain.kst import KST
from app.knowledge.embedder import get_client
from app.repo.admin import count_windows

# (id, 이름, 표, 시각 컬럼, 추가 조건). 전부 코드 상수라 f-string 으로 SQL 을 짜도 안전하다.
METRICS = (
    ("K1", "신규 가입", "profiles", "created_at", ""),
    ("K2", "AI 질문", "ask_history", "created_at", "and message is null"),
    ("K3", "사진 진단", "ask_history", "created_at", "and message = :diagnose"),
    ("K4", "가드레일 차단", "ask_history", "created_at", "and message = :blocked"),
    ("K5", "답변 불만(👎)", "ask_history", "created_at", "and rating = 'down'"),
    ("K6", "새 밭 등록", "plots", "created_at", "and deleted_at is null"),
    ("K7", "영농일지 기록", "cultivation_events", "created_at", ""),
    ("K8", "할 일 완료", "plot_tasks", "done_at", "and done"),
)

SYSTEM_PROMPT = (
    "너는 농업 AI 서비스의 운영 분석가다. 아래 [지표]는 최근 7일(이번 주)과 그 전 7일(지난주)이다. "
    "운영자가 이번 주에 알아야 할 점을 3~5개 써라: 눈에 띄는 변화, 그 의미, 할 일. "
    "숫자는 [지표]에 적힌 값만 써라. 계산해서 새 숫자를 만들지 마라. "
    'JSON 으로만 답하라: {"points": [{"text": 한두 문장, "evidence": [지표 id]}]}'
)


def collect_metrics(db: Session) -> list[Metric]:
    cur = datetime.now(KST) - timedelta(days=WINDOW_DAYS)
    params = {
        "cur": cur,
        "prev": cur - timedelta(days=WINDOW_DAYS),
        "diagnose": DIAGNOSE_MARK,
        "blocked": BLOCKED_MESSAGE,
    }
    metrics = []
    for mid, label, table, col, extra in METRICS:
        metrics.append(Metric(mid, label, *count_windows(db, table, col, extra, params)))
    return metrics


def weekly_briefing(db: Session) -> dict:
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")
    metrics = collect_metrics(db)
    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"[지표]\n{metrics_block(metrics)}"},
        ],
        response_format={"type": "json_object"},
    )
    points, dropped = parse_briefing(
        json.loads(response.choices[0].message.content or "{}"), metrics
    )
    return {
        "points": points,
        "dropped": dropped,
        "metrics": [
            {"id": m.id, "label": m.label, "cur": m.cur, "prev": m.prev} for m in metrics
        ],
    }
