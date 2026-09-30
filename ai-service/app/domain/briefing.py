"""관리자 주간 운영 브리핑 — 숫자는 코드가, 해석은 LLM 이.

지표 id 를 대지 못한 문장은 버린다. 한 발 더 나가 **문장 속 숫자도 검사한다** —
인용한 지표의 이번 주·지난주·증감·증감률 중 하나가 아니면 그 문장을 버린다.
운영 브리핑에서 가장 흔한 환각은 "그럴듯한 숫자"이기 때문이다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

WINDOW_DAYS = 7
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


@dataclass(frozen=True)
class Metric:
    id: str
    label: str
    cur: int
    prev: int


def _pct(m: Metric) -> int | None:
    return round((m.cur - m.prev) / m.prev * 100) if m.prev else None


def allowed_numbers(m: Metric) -> set[str]:
    pct = _pct(m)
    nums = {m.cur, m.prev, abs(m.cur - m.prev)} | ({abs(pct)} if pct is not None else set())
    return {str(n) for n in nums}


def metrics_block(metrics: list[Metric]) -> str:
    lines = []
    for m in metrics:
        pct = _pct(m)
        change = f"{m.cur - m.prev:+d}" + (f", {pct:+d}%" if pct is not None else "")
        lines.append(f"[{m.id}] {m.label}: 이번 주 {m.cur}, 지난주 {m.prev} ({change})")
    return "\n".join(lines)


def parse_briefing(data: dict, metrics: list[Metric]) -> tuple[list[dict], int]:
    by_id = {m.id: m for m in metrics}
    kept, dropped = [], 0
    for item in data.get("points") or []:
        text = str(item.get("text", "")).strip() if isinstance(item, dict) else ""
        ids = [i for i in dict.fromkeys(item.get("evidence") or []) if i in by_id] if text else []
        allowed = {str(WINDOW_DAYS)}.union(*(allowed_numbers(by_id[i]) for i in ids))
        if ids and set(_NUMBER.findall(text.replace(",", ""))) <= allowed:
            kept.append({"text": text, "evidence": ids})
        else:
            dropped += 1
    return kept, dropped
