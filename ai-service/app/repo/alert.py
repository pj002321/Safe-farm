"""기상특보(`weather.official_alerts`) 조회. **쿼리만 한다.**

이 표는 **append-only** 다. 배치가 돌 때마다 그 시점의 특보 전체를 새 스냅샷으로
넣고, 예전 스냅샷은 지우지 않는다. 그래서 그냥 읽으면 **이미 해제된 특보가 계속
잡힌다** — 반드시 최신 스냅샷 하나만 본다.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.alert import OfficialAlert


def latest_snapshot_at(db: Session) -> datetime | None:
    """
    # summary
    가장 최근 배치 스냅샷의 시각(`fetched_at` 최댓값). 한 건도 없으면 None.

    # params
    db: 세션<br>

    # returns
    datetime 또는 None. None 이면 특보 배치가 아직 한 번도 안 돈 것이다 —
    "특보 없음"과 다르다. 부르는 쪽이 그 둘을 화면에서 구분한다

    # examples
        latest_snapshot_at(db)  -> datetime(2026, 9, 19, 3, 0, tzinfo=utc)
    """
    return db.execute(select(func.max(OfficialAlert.fetched_at))).scalar()


def active_in_snapshot(db: Session, snapshot_at: datetime) -> list[tuple[str, str]]:
    """
    # summary
    그 스냅샷에서 **발효 중인**(CMD ≠ '해제') 특보의 (특보구역 id, 특보종류).

    # params
    db: 세션<br>
    snapshot_at: `latest_snapshot_at()` 이 준 시각. 스냅샷을 섞어 읽지 않도록
    **정확히 일치**로 건다<br>

    # returns
    (reg_id, wrn) 목록. 한 구역에 여러 특보가 겹칠 수 있어 구역당 여러 행이다

    # examples
        active_in_snapshot(db, as_of)  -> [('L1100100', '호우주의보'), ...]
    """
    return [
        (reg_id, wrn)
        for reg_id, wrn in db.execute(
            select(OfficialAlert.reg_id, OfficialAlert.wrn).where(
                OfficialAlert.fetched_at == snapshot_at,
                OfficialAlert.cmd != "해제",
            )
        ).all()
    ]
