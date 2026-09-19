"""일별 관측(`farm.weather_obs_daily`) 조회. **쿼리만 한다.**

이 표를 읽는 자리가 다섯 군데였고, 전부 "관측소 + 날짜 구간"이라는 같은 모양인데
필터가 조금씩 달랐다(어떤 곳은 기온 null 을 SQL 에서 거르고, 어떤 곳은 파이썬에서
걸렀다). 여기로 모아 **거르는 자리를 하나로** 만든다.

⚠ **누적 GDD 는 저장하지 않는다.** 여기서 관측을 통째로 받아 매번 다시 쌓는 게
  우리 방침이다(웹의 `gdd.ts` 와 같다). 중간 합계를 캐시하자는 제안은 이 파일이
  아니라 방침 자체를 바꾸는 이야기다.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.farm import WeatherObsDaily


def temps_since(
    db: Session, station_code: str, since: date, *, limit: int | None = None
) -> list[WeatherObsDaily]:
    """
    # summary
    관측소의 `since` 이후 일별 관측 중 **최고·최저기온이 둘 다 있는 것**만, 날짜 오름차순.

    기온 null 을 SQL 에서 거른다. 파이썬에서 거르면 안 쓸 행까지 네트워크로 받고,
    무엇보다 거르는 조건이 호출부마다 갈린다 — GDD 는 두 값이 다 있어야 정의된다.

    # params
    db: 세션<br>
    station_code: 기상청 지점번호<br>
    since: 이 날짜를 **포함**해 그 뒤<br>
    limit: 최대 행 수. None 이면 전부<br>

    # returns
    WeatherObsDaily 목록. 관측이 아직 안 쌓인 관측소면 빈 리스트

    # examples
        temps_since(db, "108", date(2026, 4, 1))  -> [<4/1>, <4/2>, ...]
    """
    stmt = (
        select(WeatherObsDaily)
        .where(
            WeatherObsDaily.station_code == station_code,
            WeatherObsDaily.obs_date >= since,
            WeatherObsDaily.temp_max.isnot(None),
            WeatherObsDaily.temp_min.isnot(None),
        )
        .order_by(WeatherObsDaily.obs_date)
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt))


def latest_temps(db: Session, station_code: str, days: int) -> list[WeatherObsDaily]:
    """
    # summary
    관측소의 **가장 최근** `days` 건. 최신순으로 자른 뒤 날짜 오름차순으로 돌려준다.

    `since` 로 자르는 것과 다르다. 관측이 며칠 비어도 "최근 7건"은 채워진다 —
    "최근 7일 평균" 문구가 빈 날 때문에 3건 평균이 되는 것을 막는다.

    # params
    db: 세션<br>
    station_code: 기상청 지점번호<br>
    days: 가져올 건수<br>

    # returns
    WeatherObsDaily 목록(오래된 것 → 최신). 부르는 쪽이 평균을 내므로 순서를
    맞춰 둔다

    # examples
        len(latest_temps(db, "108", 7))  -> 7
    """
    rows = list(
        db.scalars(
            select(WeatherObsDaily)
            .where(
                WeatherObsDaily.station_code == station_code,
                WeatherObsDaily.temp_max.isnot(None),
                WeatherObsDaily.temp_min.isnot(None),
            )
            .order_by(WeatherObsDaily.obs_date.desc())
            .limit(days)
        )
    )
    rows.reverse()
    return rows


def rainfall_since(
    db: Session, station_code: str, since: date
) -> list[tuple[date, float | None]]:
    """
    # summary
    관측소의 `since` 이후 (날짜, 강수량mm). 강수량이 null 인 날도 그대로 준다.

    ORM 객체가 아니라 두 칸짜리 튜플이다 — 누적 강수량을 내는 데 나머지 칼럼이
    필요 없고, 이 조회는 밭 카드마다 돌아서 행이 가볍다는 게 그대로 이득이다.

    강수량 null 을 **여기서 거르지 않는다.** 부르는 쪽이 "관측이 없다(판정 보류)"와
    "0mm 였다"를 구분해야 하기 때문이다. 거르면 그 구분이 사라진다.

    # params
    db: 세션<br>
    station_code: 기상청 지점번호<br>
    since: 이 날짜를 **포함**해 그 뒤<br>

    # returns
    (obs_date, rainfall_mm) 목록. 순서를 정하지 않는다 — 부르는 쪽이 날짜로
    창을 나눠 더할 뿐이다

    # examples
        rainfall_since(db, "108", date(2026, 9, 12))  -> [(date(2026,9,12), 3.5), ...]
    """
    rows = db.execute(
        select(WeatherObsDaily.obs_date, WeatherObsDaily.rainfall_mm).where(
            WeatherObsDaily.station_code == station_code,
            WeatherObsDaily.obs_date >= since,
        )
    ).all()
    return [(obs_date, None if mm is None else float(mm)) for obs_date, mm in rows]
