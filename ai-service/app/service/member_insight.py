"""회원 한 명의 최근 기록을 사실 목록으로 모아 LLM 에 분석시킨다."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.kst import KST
from app.domain.member_insight import Fact, facts_block, mask_pii, parse_insight
from app.knowledge.embedder import get_client
from app.models.farm import AskHistory, Crop, CropVariant, Cultivation, PlotTask
from app.repo.plot import plots_of_user

WINDOW_DAYS = 30

SYSTEM_PROMPT = (
    "너는 스마트팜 서비스의 운영 분석가다. 아래 [기록]은 한 회원의 최근 30일 활동이다. "
    'JSON 으로만 답하라: {"summary": 두 문장 요약, "segment": 활발|정착중|이탈위험|휴면 중 하나, '
    '"risks": [{"text", "evidence": [기록 id]}], "actions": [{"text", "evidence": [기록 id]}]}. '
    "risks 는 작물 피해·서비스 이탈 위험, actions 는 운영자가 할 일(알림·콘텐츠 보강 등)이다. "
    "모든 항목은 반드시 [기록] 의 id 를 근거로 대라. 기록에 없는 사실은 쓰지 마라."
)


def collect_facts(db: Session, user_id: uuid.UUID) -> list[Fact]:
    since = datetime.now(KST) - timedelta(days=WINDOW_DAYS)
    facts: list[Fact] = []

    plots = plots_of_user(db, user_id)
    plot_ids = [p.id for p in plots]
    names = {p.id: p.name for p in plots}
    for i, p in enumerate(plots, 1):
        facts.append(Fact(f"P{i}", f"밭 '{p.name}' ({p.region_ko})"))

    if plot_ids:
        rows = db.execute(
            select(Cultivation, Crop)
            .join(CropVariant, CropVariant.variant_id == Cultivation.variant_id)
            .join(Crop, Crop.crop_id == CropVariant.crop_id)
            .where(Cultivation.plot_id.in_(plot_ids), Cultivation.deleted_at.is_(None))
        ).all()
        for i, (c, crop) in enumerate(rows, 1):
            facts.append(Fact(
                f"C{i}",
                f"{names.get(c.plot_id)} 에 {crop.name} 재배, 상태 {c.status}, 파종 {c.sowing_date}",
            ))

        tasks = db.scalars(
            select(PlotTask)
            .where(PlotTask.plot_id.in_(plot_ids), PlotTask.generated_at >= since)
            .order_by(PlotTask.generated_at.desc())
            .limit(20)
        ).all()
        for i, t in enumerate(tasks, 1):
            state = "완료" if t.done else "만료" if t.expired_at else "미완료"
            facts.append(Fact(
                f"T{i}", f"할 일 '{t.title}' ({t.priority}) {state}, 생성 {t.generated_at:%m-%d}"
            ))

        # ponytail: cultivation_events 는 모델이 없어 SQL 로 읽는다. 다른 곳에서도 쓰이면 모델로 올릴 것.
        events = db.execute(
            text(
                "select e.kind, e.occurred_on, e.body, e.work_kind from cultivation_events e "
                "join cultivations c on c.id = e.cultivation_id "
                "where c.plot_id = any(:plot_ids) and c.deleted_at is null "
                "and e.occurred_on >= :since "
                "order by e.occurred_on desc limit 15"
            ),
            {"plot_ids": plot_ids, "since": since.date()},
        ).all()
        for i, e in enumerate(events, 1):
            body = mask_pii((e.body or e.work_kind or "")[:80])
            facts.append(Fact(f"E{i}", f"영농일지 {e.occurred_on} {e.kind} {body}"))

    asks = db.scalars(
        select(AskHistory)
        .where(AskHistory.user_id == user_id, AskHistory.created_at >= since)
        .order_by(AskHistory.created_at.desc())
        .limit(15)
    ).all()
    for i, a in enumerate(asks, 1):
        rating = f", 평가 {a.rating}" if a.rating else ""
        facts.append(Fact(
            f"Q{i}", f"질문 {a.created_at:%m-%d} '{mask_pii(a.question[:80])}'{rating}"
        ))

    return facts


def analyze_member(db: Session, user_id: uuid.UUID) -> dict:
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")
    facts = collect_facts(db, user_id)
    if not facts:
        return {"summary": "최근 30일 기록이 없습니다.", "segment": "휴면",
                "risks": [], "actions": [], "dropped": 0, "facts": []}

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"[기록]\n{facts_block(facts)}"},
        ],
        response_format={"type": "json_object"},
    )
    data = json.loads(response.choices[0].message.content or "{}")
    result = parse_insight(data, {f.id for f in facts})
    result["facts"] = [{"id": f.id, "text": f.text} for f in facts]
    return result
