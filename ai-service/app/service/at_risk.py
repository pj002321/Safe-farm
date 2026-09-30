"""밭을 가진 회원 전체에서 위험 신호를 모아 상위 회원과 안내문 초안을 낸다."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.at_risk import assess, parse_drafts
from app.domain.kst import KST
from app.domain.member_insight import mask_pii
from app.knowledge.embedder import get_client
from app.repo import admin as repo
from app.repo.plot import all_live_plots
from app.service.sigungu_ref import sigungu_code_at
from app.service.warn_region import (
    sigungu_warn_regions,
    sigungu_warning_status,
    warn_region_up_by_id,
)

WINDOW_DAYS = 14
TOP_N = 10

SYSTEM_PROMPT = (
    "너는 농업 서비스 운영자다. 아래 [회원]마다 운영자가 보낼 안내 메시지를 존댓말 두 문장 "
    "이내로 써라. 사유에 맞춰 구체적으로 쓴다: 특보면 대비 요령 확인 권유, 밀린 할 일이면 "
    "확인 권유, 불만이면 사과와 개선 약속, 활동 없음이면 지금 시기 작물 관리 안내. "
    '농약 이름·분량은 쓰지 마라. JSON 으로만 답하라: {"drafts": [{"id": 회원 id, "message": 문장}]}'
)


def collect_candidates(db: Session) -> tuple[list[dict], datetime | None]:
    now = datetime.now(KST)
    status_by_code, as_of = sigungu_warning_status(
        db, list(sigungu_warn_regions()), warn_region_up_by_id()
    )

    by_user: dict = defaultdict(lambda: {"plots": [], "warnings": []})
    for p in all_live_plots(db):
        user = by_user[p.user_id]
        user["plots"].append(mask_pii(p.name or p.region_ko))
        # ponytail: 밭마다 좌표→시군구 판정. 밭이 수천 개로 늘면 plots 에 시군구 코드를 저장할 것.
        status = status_by_code.get(sigungu_code_at(float(p.latitude), float(p.longitude)))
        for wrn in status["warnings"] if status else []:
            if wrn not in user["warnings"]:
                user["warnings"].append(wrn)

    last_at = repo.last_activity_by_user(db)
    open_tasks = repo.open_tasks_by_user(db)
    downs = repo.downs_by_user(db, now - timedelta(days=WINDOW_DAYS))

    candidates = []
    for user_id, user in by_user.items():
        score, reasons = assess(
            (now - last_at[user_id]).days,
            open_tasks.get(user_id, 0),
            downs.get(user_id, 0),
            user["warnings"],
        )
        if score:
            candidates.append({"userId": str(user_id), "score": score, "reasons": reasons, **user})
    candidates.sort(key=lambda c: -c["score"])
    return candidates[:TOP_N], as_of


def at_risk_report(db: Session) -> dict:
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")
    candidates, as_of = collect_candidates(db)
    for i, c in enumerate(candidates, 1):
        c["id"] = f"M{i}"

    drafts: dict[str, str] = {}
    if candidates:
        block = "\n".join(
            f"[{c['id']}] 밭: {', '.join(c['plots'])} / 사유: {'; '.join(c['reasons'])}"
            for c in candidates
        )
        response = get_client().chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"[회원]\n{block}"},
            ],
            response_format={"type": "json_object"},
        )
        drafts = parse_drafts(
            json.loads(response.choices[0].message.content or "{}"), {c["id"] for c in candidates}
        )

    for c in candidates:
        c["draft"] = drafts.get(c.pop("id"))
    return {"asOf": as_of.isoformat() if as_of else None, "members": candidates}
