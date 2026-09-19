"""위성 관측 캐시 표(`satellite_observations`·`satellite_fetches`) 조회·쓰기.
**쿼리만 한다** — 캐시가 신선한지, 실패 시 무엇을 돌려줄지는
`service/satellite_cache.py` 가 정한다.

⚠ **커밋하지 않는다.** 실패 시 롤백할지 말지를 service 가 정해야 하므로
  트랜잭션 경계는 여기서 긋지 않는다.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.farm import SatelliteFetch, SatelliteObservation


def fetch_log(db: Session, lat: float, lon: float) -> SatelliteFetch | None:
    """
    # summary
    이 좌표를 마지막으로 언제·어디까지 물어봤는지. 없으면 None(처음 보는 좌표).

    # params
    db: 세션<br>
    lat: 반올림된 위도(캐시 열쇠)<br>
    lon: 반올림된 경도(캐시 열쇠)<br>

    # returns
    SatelliteFetch 또는 None

    # examples
        fetch_log(db, 36.41, 128.16).covered_from  -> date(2026, 6, 1)
    """
    return db.get(SatelliteFetch, (lat, lon))


def observations_between(
    db: Session, lat: float, lon: float, date_from: date, date_to: date
) -> list[SatelliteObservation]:
    """
    # summary
    표에 담긴 이 좌표·구간의 NDVI·NDMI 관측. **밖에 묻지 않는다.**

    # params
    db: 세션<br>
    lat: 반올림된 위도<br>
    lon: 반올림된 경도<br>
    date_from: 시작일(포함)<br>
    date_to: 끝일(포함)<br>

    # returns
    SatelliteObservation 목록. obs_date 오름차순

    # examples
        [o.ndvi for o in observations_between(db, 36.41, 128.16, 시작, 끝)]
    """
    return list(
        db.execute(
            select(SatelliteObservation)
            .where(
                SatelliteObservation.lat == lat,
                SatelliteObservation.lon == lon,
                SatelliteObservation.obs_date >= date_from,
                SatelliteObservation.obs_date <= date_to,
            )
            .order_by(SatelliteObservation.obs_date)
        ).scalars()
    )


def insert_observations(db: Session, lat: float, lon: float, points: list[dict]) -> None:
    """
    # summary
    새로 받은 관측을 표에 넣는다. **이미 있는 날짜는 덮지 않는다**
    (지나간 관측은 값이 바뀌지 않으므로 덮을 이유가 없다).

    # params
    db: 세션<br>
    lat: 반올림된 위도<br>
    lon: 반올림된 경도<br>
    points: {"date", "ndvi", "ndmi"} 딕셔너리 목록. 비어 있으면 아무 일도 안 한다<br>

    # examples
        insert_observations(db, 36.41, 128.16, [{"date": "2026-06-01", "ndvi": 0.5, "ndmi": 0.2}])
    """
    if not points:
        return
    db.execute(
        insert(SatelliteObservation)
        .values(
            [
                {
                    "lat": lat,
                    "lon": lon,
                    "obs_date": date.fromisoformat(p["date"]),
                    "ndvi": p.get("ndvi"),
                    "ndmi": p.get("ndmi"),
                }
                for p in points
            ]
        )
        .on_conflict_do_nothing(index_elements=["lat", "lon", "obs_date"])
    )


def upsert_fetch_log(
    db: Session, lat: float, lon: float, covered_from: date, fetched_at: datetime
) -> None:
    """
    # summary
    "언제·어디까지 물어봤나"를 새로 쓴다. 이미 있으면 구간은 **넓은 쪽으로**
    남기고 시각만 갱신한다 — 이미 90일치를 받아 뒀는데 30일 요청이 덮어쓰면
    다음 90일 요청이 캐시를 못 쓴다.

    # params
    db: 세션<br>
    lat: 반올림된 위도<br>
    lon: 반올림된 경도<br>
    covered_from: 이번에 받은 구간의 시작일<br>
    fetched_at: 물어본 시각(UTC)<br>

    # examples
        upsert_fetch_log(db, 36.41, 128.16, 시작일, now_utc)
    """
    db.execute(
        insert(SatelliteFetch)
        .values(lat=lat, lon=lon, covered_from=covered_from, fetched_at=fetched_at)
        .on_conflict_do_update(
            index_elements=["lat", "lon"],
            set_={
                "covered_from": func.least(SatelliteFetch.covered_from, covered_from),
                "fetched_at": fetched_at,
            },
        )
    )
