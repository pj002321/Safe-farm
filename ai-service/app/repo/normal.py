"""평년값(`weather.normals`) 조회. **쿼리만 한다.**

이 표는 관측소 × (월, 일) 365행짜리 고정 표다 — 연도가 없다. 그래서 "기간의
평년 누적"은 날짜 구간을 (월, 일)로 풀어 골라 더하는 식으로만 낼 수 있고,
그 푸는 일은 `service/gdd_region.py` 가 한다.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.normal import Normal


def normals_of(
    db: Session, stations: Sequence[str], source: str
) -> list[tuple[str, int, int, float | None, float | None]]:
    """
    # summary
    평년 기간 **하나**에서 관측소 여럿의 일별 평년값을 한 번에 읽는다.

    ⚠ `source` 를 섞어 부르지 말 것. `normals` 에는 기간이 다른 두 벌이 같이
      들어 있고(`kma` 는 최신 30년, `kma-1981` 은 1981~2010), 두 기간을 평균하면
      어느 30년에도 해당하지 않는 값이 나온다. 관측소마다 있는 쪽 한 벌만 쓴다
      — 우선순위는 `service/gdd_region.NORMAL_SOURCES` 에 적어 두었다.

    # params
    db: 세션<br>
    stations: 지점번호 목록. 빈 목록이면 질의하지 않는다 — 돌 이유가 없는 질의다<br>
    source: 평년 기간 한 벌의 이름<br>

    # returns
    (station, month, day, tmax_normal, tmin_normal) 목록. 결측을 그대로 준다 —
    둘 중 하나라도 비면 그날 GDD 를 못 낸다는 판단은 부르는 쪽이 한다

    # examples
        len(normals_of(db, ["108"], "kma"))  -> 365
    """
    if not stations:
        return []
    return list(
        db.execute(
            select(
                Normal.station,
                Normal.month,
                Normal.day,
                Normal.tmax_normal,
                Normal.tmin_normal,
            ).where(Normal.station.in_(stations), Normal.source == source)
        ).all()
    )
