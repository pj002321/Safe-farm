"""시군구 단위 기상특보 발효 현황 조회. F4(재해 경보)의 지역 집계 버전(V1-39).

판정 로직은 app/domain/warn_region.py(순수 함수), 이 파일은 DB에서 값을 모아 넘겨주기만 한다.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.warn_region import active_wrn_kinds, ancestors, classify_warning
from app.models.alert import OfficialAlert


def _latest_active_alerts(db: Session) -> list[dict]:
    """가장 최근 배치 스냅샷(fetched_at 최댓값)의 발효 중(CMD≠해제) 특보만.

    official_alerts 는 append-only 라 예전 스냅샷이 계속 쌓인다 — 최신 한 번만 봐야
    해제된 특보가 계속 잡히지 않는다.
    """
    latest = db.execute(select(func.max(OfficialAlert.fetched_at))).scalar()
    if latest is None:
        return []

    rows = db.execute(
        select(OfficialAlert.reg_id, OfficialAlert.wrn).where(
            OfficialAlert.fetched_at == latest, OfficialAlert.cmd != "해제"
        )
    ).all()
    return [{"reg_id": reg_id, "wrn": wrn} for reg_id, wrn in rows]


def sigungu_warning_status(
    db: Session, sigungu_warn_regions: list[dict], reg_up_by_id: dict[str, str]
) -> dict[str, dict]:
    """시군구 코드 → {regId, warnings, color, label}. 특보가 없으면 color/label 은 None."""
    alerts = _latest_active_alerts(db)

    out: dict[str, dict] = {}
    for row in sigungu_warn_regions:
        reg_id = row["reg_id"]
        reg_ids = set(ancestors(reg_id, reg_up_by_id))
        wrn_kinds = active_wrn_kinds(reg_ids, alerts)
        color, label = classify_warning(wrn_kinds)

        out[row["sigungu_code"]] = {
            "regId": reg_id,
            "warnings": wrn_kinds,
            "color": color,
            "label": label,
        }
    return out
