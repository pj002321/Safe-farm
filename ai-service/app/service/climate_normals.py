"""이 좌표에서 가장 가까운 관측소의 (월,일)별 평년값. `recommend.py`(설명용)와
`variant.py`(숙기 판단용) 둘 다 같은 조회를 필요로 해 여기 하나로 모은다.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.geo import nearest
from app.repo.normal import normals_of
from app.repo.station import all_stations
from app.service.gdd_region import NORMAL_SOURCES


def normals_by_day_near(
    db: Session, lat: float, lon: float
) -> dict[tuple[int, int], tuple[float, float]]:
    """이 좌표에서 가장 가까운 관측소의 (월,일) → (평년 최고, 평년 최저).

    관측소가 없거나 그 관측소에 평년값이 없으면 빈 dict — "일시적인 수치만으로
    말하지 마라"는 요구를 못 지킬 근거가 없다는 뜻이라, 부르는 쪽이 판단을
    보류하거나(recommend 설명) 기존 기본값으로 떨어진다(variant 숙기 추천).
    """
    station = nearest(lat, lon, all_stations(db))
    if station is None:
        return {}
    for source in NORMAL_SOURCES:
        rows = normals_of(db, [station.station_code], source)
        by_day = {
            (m, d): (tmax, tmin)
            for _stn, m, d, tmax, tmin in rows
            if tmax is not None and tmin is not None
        }
        if by_day:
            return by_day
    return {}
