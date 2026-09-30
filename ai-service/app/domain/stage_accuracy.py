"""생육단계 예측 오차 — 사용자가 고친 단계(정답)와 그날 모델이 낸 단계(예측)의 차이.

오차 단위는 **단계 칸 수**다(예측 3단계, 실제 4단계 → -1). 날짜 오차가 아니다 —
단계 도달일을 따로 받지 않고, 사용자가 "지금 이 단계"라고 고친 기록만 있기 때문이다.
관측이 끊긴 날의 보정은 GDD 가 덜 쌓여 예측이 늦게 나오므로 MAE 에서 뺀다.
"""

from __future__ import annotations


def summarize_errors(rows: list[dict]) -> dict:
    """rows: [{"predicted": int|None, "actual": int, "stage": str, "usable": bool}]."""
    usable = [r for r in rows if r["usable"] and r["predicted"] is not None]
    errors = [r["predicted"] - r["actual"] for r in usable]
    by_stage: dict[str, list[int]] = {}
    for r, e in zip(usable, errors, strict=True):
        by_stage.setdefault(r["stage"], []).append(e)
    return {
        "n": len(usable),
        "excluded": len(rows) - len(usable),
        "mae": round(sum(abs(e) for e in errors) / len(errors), 2) if errors else None,
        # 부호가 있는 평균. 음수면 모델이 실제보다 늦게(덜 자랐다고) 본다.
        "bias": round(sum(errors) / len(errors), 2) if errors else None,
        "byStage": [
            {"stage": s, "n": len(es), "mae": round(sum(abs(e) for e in es) / len(es), 2)}
            for s, es in by_stage.items()
        ],
    }
