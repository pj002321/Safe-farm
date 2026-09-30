"""최근 질문을 주제로 묶어 콘텐츠 공백(불만이 몰린 주제)을 찾는다."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.guardrail import BLOCKED_MESSAGE
from app.domain.kst import KST
from app.domain.member_insight import Fact, facts_block, mask_pii
from app.domain.question_trend import parse_topics
from app.knowledge.embedder import get_client
from app.models.farm import AskHistory

WINDOW_DAYS = 30
# ponytail: 최근 200개만 본다. 넘치면 주 단위로 나눠 묶고 주제 이름으로 합칠 것.
MAX_QUESTIONS = 200

SYSTEM_PROMPT = (
    "너는 농업 AI 상담 서비스의 콘텐츠 분석가다. 아래 [질문]들을 비슷한 주제"
    "(작물 + 문제 유형, 예: '고추 탄저병 방제')로 5~10개 묶어라. "
    'JSON 으로만 답하라: {"topics": [{"name": 주제, "evidence": [질문 id], '
    '"suggestion": 이 주제에 보강할 문서·기능 한 문장}]}. '
    "질문 하나는 한 주제에만 넣어라. [불만] 표시는 사용자가 답변에 불만을 남긴 질문이다. "
    "[질문]에 없는 id 를 쓰지 마라."
)


def analyze_questions(db: Session) -> dict:
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")
    since = datetime.now(KST) - timedelta(days=WINDOW_DAYS)
    rows = db.scalars(
        select(AskHistory)
        .where(
            AskHistory.created_at >= since,
            AskHistory.message.is_distinct_from(BLOCKED_MESSAGE),
        )
        .order_by(AskHistory.created_at.desc())
        .limit(MAX_QUESTIONS)
    ).all()
    if not rows:
        return {"total": 0, "unassigned": 0, "topics": [], "facts": []}

    facts, down_by_id = [], {}
    for i, row in enumerate(rows, 1):
        fid = f"Q{i}"
        down = row.rating == "down"
        down_by_id[fid] = down
        text = mask_pii(row.question[:100])
        if down:
            text += f" [불만: {mask_pii(row.feedback_reason or '사유 없음')[:60]}]"
        facts.append(Fact(fid, text))

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"[질문]\n{facts_block(facts)}"},
        ],
        response_format={"type": "json_object"},
    )
    topics = parse_topics(json.loads(response.choices[0].message.content or "{}"), down_by_id)
    return {
        "total": len(facts),
        "unassigned": len(facts) - sum(t["count"] for t in topics),
        "topics": topics,
        "facts": [{"id": f.id, "text": f.text} for f in facts],
    }
