"""관리자용 질문 트렌드 — LLM 이 묶은 주제를 코드가 다시 센다.

LLM 에게는 주제 이름과 보강 제안만 맡긴다. 질문 수·불만 수는 LLM 이 댄 질문 id 를
실제 목록과 맞춰 코드가 센다 — 숫자를 LLM 이 부르면 그럴듯하게 지어낸다.
질문 하나는 먼저 나온 주제 하나에만 센다(중복 집계 방지).
"""

from __future__ import annotations


def parse_topics(data: dict, down_by_id: dict[str, bool]) -> list[dict]:
    topics, seen = [], set()
    for item in data.get("topics") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        ids = [
            i
            for i in dict.fromkeys(e for e in item.get("evidence") or [] if isinstance(e, str))
            if i in down_by_id and i not in seen
        ]
        if not name or not ids:
            continue
        seen.update(ids)
        topics.append({
            "name": name,
            "suggestion": str(item.get("suggestion", "")).strip(),
            "evidence": ids,
            "count": len(ids),
            "down": sum(down_by_id[i] for i in ids),
        })
    return sorted(topics, key=lambda t: (-t["down"], -t["count"]))
