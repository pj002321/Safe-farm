"""오랜만에 온 사용자에게 건네는 인사 — 그동안 쌓인 밭 위험을 친절하게 알린다.

관리자 위험 회원 리포트와 같은 원칙이다: **무엇을 말할지는 기록이 정하고, LLM 은 말투만 맡는다.**
LLM 이 쓴 문장마다 근거 사실 id 를 대게 하고, 실제로 넘긴 사실에 없는 id 만 댄 문장은 버린다.
농약 분량이 들어간 문장은 가드레일로 버린다 — 사용자에게 바로 보이는 글이라서다.
"""

from __future__ import annotations

from app.domain.guardrail import is_blocked_topic
from app.domain.member_insight import verified_findings

#: 이만큼 아무것도 안 했으면 "오랜만"이다. 관리자 위험 회원 리포트의 첫 단계(7일)와 같다.
IDLE_DAYS = 7


def should_greet(idle_days: int | None) -> bool:
    return idle_days is not None and idle_days >= IDLE_DAYS


def parse_greeting(data: dict, known_ids: set[str]) -> dict | None:
    """LLM 응답 → {"greeting", "items"}. 남는 항목이 하나도 없으면 None(인사를 띄우지 않는다)."""
    items, _ = verified_findings(data.get("items"), known_ids)
    items = [i for i in items if not is_blocked_topic(i["text"])]
    greeting = str(data.get("greeting", "")).strip()
    if not items or is_blocked_topic(greeting):
        return None
    return {"greeting": greeting, "items": items}
