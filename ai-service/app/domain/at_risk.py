"""이탈·피해 위험 회원 선별 — 점수는 규칙이, 문장은 LLM 이.

누구를 먼저 챙길지는 설명 가능한 규칙으로 정한다(관리자가 "왜 이 사람?"에 답할 수 있게).
LLM 은 뽑힌 회원에게 보낼 안내문 초안만 쓴다. 초안도 그대로 믿지 않는다 —
목록에 없는 회원 id 는 버리고, 농약 분량이 들어간 초안은 가드레일로 버린다.
"""

from __future__ import annotations

from app.domain.guardrail import is_blocked_topic


def assess(idle_days: int, open_tasks: int, downs: int, warnings: list[str]) -> tuple[int, list[str]]:
    score, reasons = 0, []
    if idle_days >= 14:
        score += 3
        reasons.append(f"{idle_days}일째 활동 없음")
    elif idle_days >= 7:
        score += 1
        reasons.append(f"{idle_days}일째 활동 없음")
    if open_tasks >= 3:
        score += 2
        reasons.append(f"밀린 할 일 {open_tasks}건")
    if downs >= 2:
        score += 2
        reasons.append(f"최근 불만 평가 {downs}건")
    if warnings:
        # 특보만으로는 약한 신호다. 이미 방치 신호가 있는 회원에게 겹치면 가장 급하다.
        score += 3 if score else 1
        reasons.append(f"밭에 {'·'.join(warnings)} 특보 발효 중")
    return score, reasons


def parse_drafts(data: dict, known_ids: set[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in data.get("drafts") or []:
        if not isinstance(item, dict):
            continue
        member_id = item.get("id")
        message = str(item.get("message", "")).strip()
        if member_id in known_ids and member_id not in out and message and not is_blocked_topic(message):
            out[member_id] = message
    return out
