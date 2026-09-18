"""LLM 리포트 출력 계약. app/service/report.py 가 LLM 에게 시킨 고정 JSON
{"요약": str, "할일": [str], "주의": [str]} 을 검증한다 — 모델이 가끔 키를 빼먹거나
문자열이 아닌 값을 넣을 수 있어, 화면에 그대로 꽂기 전에 여기서 걸러낸다.

DB·LLM 의존 없음 — app/service/report.py 가 파싱된 JSON dict 를 넘겨 검증만 시킨다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ReportPayload:
    summary: str
    todos: list[str]
    cautions: list[str]


def parse_report_json(data: dict) -> ReportPayload | None:
    """모양이 안 맞으면 None — 화면은 이걸 '생성 실패'로 다룬다."""
    summary = data.get("요약")
    todos = data.get("할일")
    cautions = data.get("주의")

    if not isinstance(summary, str) or not summary:
        return None
    if not isinstance(todos, list) or not all(isinstance(t, str) for t in todos):
        return None
    if not isinstance(cautions, list) or not all(isinstance(c, str) for c in cautions):
        return None

    return ReportPayload(summary=summary, todos=todos, cautions=cautions)
