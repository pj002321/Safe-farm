"""오랜만에 온 사용자의 밭에 그동안 쌓인 위험을 사실로 모아 친절한 인사로 만든다."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.kst import KST
from app.domain.member_insight import Fact, facts_block, mask_pii
from app.domain.welcome_back import parse_greeting, should_greet
from app.knowledge.embedder import get_client
from app.repo.cultivation import growing_in_order
from app.repo.plot import last_activity_of_user, plots_of_user
from app.repo.plot_task import overdue_open
from app.service.plot_growth import cultivation_growth, nearest_station
from app.service.warn_region import plot_warning

#: 이만큼 지나도 안 끝난 할 일만 "밀린 일"로 센다. 위험 회원 리포트와 같은 기준.
OVERDUE_DAYS = 3

SYSTEM_PROMPT = (
    "너는 텃밭을 함께 돌봐 주는 다정한 농사 도우미다. 사용자가 며칠 만에 돌아왔다. "
    "아래 [사실]만 보고, 그동안 밭에 쌓인 걱정거리를 친구에게 말하듯 존댓말로 알려라. "
    "각 항목은 '○○밭이 이런 상태인데 괜찮으신가요?'처럼 상태를 짚고 안부를 묻는 한두 문장이다. "
    "겁주지 말고, 해 볼 만한 일 하나를 가볍게 권해라. 급한 것(특보·오래 밀린 일)을 먼저 써라. "
    "[사실]에 없는 날씨·병해충·수치는 지어내지 마라. 농약 이름·희석배수·살포량은 쓰지 마라. "
    'JSON 으로만 답하라: {"greeting": 반가운 첫 인사 한 문장, '
    '"items": [{"text": 문장, "evidence": [사실 id]}]} — 항목은 최대 4개.'
)


def collect_facts(db: Session, user_id: uuid.UUID, now: datetime) -> list[Fact]:
    facts: list[Fact] = []
    plots = plots_of_user(db, user_id)
    names = {p.id: mask_pii(p.name or p.region_ko) for p in plots}

    for p in plots:
        warning, _ = plot_warning(db, float(p.latitude), float(p.longitude))
        if warning and warning["warnings"]:
            facts.append(Fact(f"W{len(facts) + 1}", f"{names[p.id]}: 지금 {'·'.join(warning['warnings'])} 특보 발효 중"))

    for t in overdue_open(db, [p.id for p in plots], now - timedelta(days=OVERDUE_DAYS)):
        days = (now - t.generated_at).days
        facts.append(Fact(
            f"T{len(facts) + 1}",
            f"{names.get(t.plot_id)}: 할 일 '{t.title}' 이 {days}일째 안 끝남 (이유: {t.reason})",
        ))

    for p in plots:
        station = nearest_station(db, p)
        if station is None:
            continue
        for c in growing_in_order(db, p.id):
            growth = cultivation_growth(db, c, station)
            if growth and growth.stage_name:
                facts.append(Fact(
                    f"G{len(facts) + 1}",
                    f"{names[p.id]}: {growth.crop_name_ko} 이(가) 지금 '{growth.stage_name}' 단계",
                ))
    return facts


def welcome_back(db: Session, user_id: uuid.UUID) -> dict:
    """{"show": False} 이거나 {"show": True, "idleDays", "greeting", "items", "since"}."""
    now = datetime.now(KST)
    last = last_activity_of_user(db, user_id)
    idle_days = (now - last).days if last else None
    if not should_greet(idle_days):
        return {"show": False}

    facts = collect_facts(db, user_id, now)
    # 생육단계만 있으면 "걱정거리"가 아니다. 특보나 밀린 일이 있을 때만 말을 건다.
    if not any(f.id[0] in "WT" for f in facts) or not OPENAI_MODEL:
        return {"show": False}

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"며칠 만에 왔나: {idle_days}일\n[사실]\n{facts_block(facts)}"},
        ],
        response_format={"type": "json_object"},
    )
    parsed = parse_greeting(json.loads(response.choices[0].message.content or "{}"), {f.id for f in facts})
    if parsed is None:
        return {"show": False}
    # `since` 는 화면의 "닫기"가 기억하는 키다 — 같은 부재에 대해 한 번 닫으면 다시 안 뜬다.
    return {"show": True, "idleDays": idle_days, "since": last.isoformat(), **parsed}
