"""관측소 조회. **쿼리만 한다 — 거리 계산은 `domain/geo.py` 가 한다.**

관측소 표는 **작고 거의 안 변한다**(전국 100여 개. 기상청이 지점을 신설·폐지할
때만 바뀌고, 그건 pipeline 이 다시 심을 때다). 그런데 "밭에서 가장 가까운
관측소"를 고르는 자리가 요청 경로마다 있어서, 대시보드 한 장을 그리면 밭 수만큼
전체 select 가 돌았다. 그래서 프로세스 수명 동안 한 번만 읽고 캐시한다.

⚠ **캐시에 ORM 객체를 담지 않는다.** `Session.commit()` 은 그 세션의 객체를
  만료시키고, 세션이 닫힌 뒤 필드를 읽으면 `DetachedInstanceError` 로 죽는다.
  요청마다 세션이 새로 열리는 구조라 ORM 객체를 전역에 두는 것은 시한폭탄이다.
  그래서 필요한 네 칸만 `StationRow` 로 떠서 담는다 — 덤으로 `Numeric` 이
  `Decimal` 로 올라오는 것도 여기서 한 번에 `float` 로 끝난다.

⚠ **캐시는 프로세스 단위다.** 워커가 여러 개면 워커마다 따로 채운다. 이 표는
  배치가 다시 심을 때만 바뀌고 그때는 재기동이 따라오므로 그걸로 충분하다.
  그래도 갱신이 필요하면 `reset_station_cache()` 를 부른다(테스트도 이걸 쓴다).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.farm import Station


@dataclass(frozen=True, slots=True)
class StationRow:
    """관측소 한 줄. 전역 캐시에 담기므로 **불변**이고 ORM 에 묶이지 않는다."""

    station_code: str
    name: str
    latitude: float
    longitude: float


#: 프로세스 전역 캐시. None 이면 아직 안 읽었다는 뜻이다. 빈 리스트와 구분해야
#: 한다 — 초기 DB(관측소 0건)에서 매 요청 재조회하는 걸 막기 위해서다.
_cache: list[StationRow] | None = None


def reset_station_cache() -> None:
    """캐시를 비운다. 관측소를 새로 심은 배치와 테스트가 부른다."""
    global _cache
    _cache = None


def all_stations(db: Session) -> list[StationRow]:
    """
    # summary
    관측소 전부. 프로세스에서 처음 부를 때만 DB 를 타고, 그 뒤로는 캐시다.

    # params
    db: 세션. 캐시가 차 있으면 쓰이지 않는다<br>

    # returns
    StationRow 목록. 초기 DB 면 빈 리스트이고, **그 빈 결과도 캐시한다** — 관측소
    없이 뜬 프로세스는 재기동 전까지 계속 빈 것으로 본다. 거기서 재조회를 돌리면
    가장 느린 상황(데이터 없음)에서 가장 많이 조회하게 된다

    # examples
        len(all_stations(db))  -> 109
    """
    global _cache
    if _cache is None:
        _cache = [
            StationRow(
                station_code=s.station_code,
                name=s.name,
                latitude=float(s.latitude),
                longitude=float(s.longitude),
            )
            for s in db.scalars(select(Station))
        ]
    return _cache


def station_by_code(db: Session, station_code: str) -> StationRow | None:
    """
    # summary
    지점번호로 관측소 하나. 없으면 None.

    캐시를 훑는다. 100여 개라 선형 검색으로 충분하고, 왕복을 아끼는 쪽이 이긴다.

    # params
    db: 세션<br>
    station_code: 기상청 지점번호. 정수가 아니라 text 다(모델 주석 참고)<br>

    # returns
    StationRow 또는 None

    # examples
        station_by_code(db, "108").name  -> "서울"
    """
    for station in all_stations(db):
        if station.station_code == station_code:
            return station
    return None
