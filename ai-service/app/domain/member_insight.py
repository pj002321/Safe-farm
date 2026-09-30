"""관리자용 회원 분석 — LLM 출력 검증.

LLM 이 댄 근거 id 를 그대로 믿지 않는다 — 사실 목록에 실제로 있는 id 만 남기고,
하나도 못 댄 항목은 버린다. 버린 개수는 화면에 그대로 보여 준다(환각률 지표).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SEGMENTS = ("활발", "정착중", "이탈위험", "휴면")

_PHONE = re.compile(r"01[0-9][-\s]?\d{3,4}[-\s]?\d{4}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def mask_pii(text: str) -> str:
    """사용자가 쓴 글을 프롬프트에 넣기 전에 전화·이메일을 가린다."""
    return _EMAIL.sub("[이메일]", _PHONE.sub("[전화]", text))


@dataclass(frozen=True)
class Fact:
    id: str
    text: str


def facts_block(facts: list[Fact]) -> str:
    return "\n".join(f"[{f.id}] {f.text}" for f in facts)


def _findings(items: object, known: set[str]) -> tuple[list[dict], int]:
    kept, dropped = [], 0
    for item in items if isinstance(items, list) else []:
        text = str(item.get("text", "")).strip() if isinstance(item, dict) else ""
        ids = [i for i in item.get("evidence") or [] if i in known] if text else []
        if ids:
            kept.append({"text": text, "evidence": ids})
        else:
            dropped += 1
    return kept, dropped


def parse_insight(data: dict, known_ids: set[str]) -> dict:
    risks, d1 = _findings(data.get("risks"), known_ids)
    actions, d2 = _findings(data.get("actions"), known_ids)
    segment = data.get("segment")
    return {
        "summary": str(data.get("summary", "")).strip(),
        "segment": segment if segment in SEGMENTS else None,
        "risks": risks,
        "actions": actions,
        "dropped": d1 + d2,
    }
