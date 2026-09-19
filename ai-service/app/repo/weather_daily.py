"""격자 일별 기상(`weather.weather_daily`) 조회. **쿼리만 한다.**

`farm.weather_obs_daily`(→ `repo/weather_obs.py`)와 **다른 표**다. 헷갈리기 쉬워
적어 둔다:

  · `farm.weather_obs_daily`  — 관측소 코드가 키. 밭 하나의 GDD·강수를 쌓는 데 쓴다.
  · `weather.weather_daily`   — `plot_id` 가 키. 지도 레이어(시군구 250개)가 쓴다.
    관측소를 넣을 때는 `stn:<지점번호>` 꼴의 가짜 plot_id 를 쓴다
    (`domain/gdd.py` 의 `station_plot_id`).

⚠ **`kind` 를 반드시 건다.** 이 표에는 실측(`obs`)과 예보가 같이 산다. 안 걸면
  지도가 예보를 실측인 것처럼 칠한다.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models.weather import WeatherDaily


def obs_values(
    db: Session, plot_ids: Sequence[str], column: ColumnElement
) -> list[tuple[str, date, float]]:
    """
    # summary
    실측 행의 (plot_id, 날짜, 지정한 칼럼 값). **값이 None 인 행은 뺀다.**

    칼럼을 인자로 받는다 — 강수(`rain`)와 최대풍속(`wind_max`)이 같은 모양의
    조회라서 함수를 두 벌 두면 조건이 갈린다.

    # params
    db: 세션<br>
    plot_ids: `stn:108` 꼴의 목록. 빈 목록이면 질의하지 않는다<br>
    column: `WeatherDaily.rain` 처럼 이 표의 칼럼<br>

    # returns
    (plot_id, date, value) 목록. 순서를 정하지 않는다 — 부르는 쪽이 관측소별
    최댓값 날짜를 고른다

    # examples
        obs_values(db, ["stn:108"], WeatherDaily.rain)  -> [('stn:108', date(...), 3.5)]
    """
    if not plot_ids:
        return []
    rows = db.execute(
        select(WeatherDaily.plot_id, WeatherDaily.date, column).where(
            WeatherDaily.plot_id.in_(plot_ids),
            WeatherDaily.kind == "obs",
            column.is_not(None),
        )
    ).all()
    return [(plot_id, d, value) for plot_id, d, value in rows]


def temps_in_range(
    db: Session, plot_ids: Sequence[str], start: date, end: date
) -> list[tuple[str, float | None, float | None]]:
    """
    # summary
    기간 안의 (plot_id, 최고기온, 최저기온). 지도의 지역 GDD 를 쌓는 재료다.

    ⚠ **`kind` 를 걸지 않는다.** 지역 GDD 는 이 구간의 실측을 쌓는 것이 목적이지만,
      이 조회의 호출부(`service/gdd_region.py`)가 예전부터 걸지 않고 있었다. 지금
      거는 것은 지도 색이 통째로 바뀌는 변경이라 **이 리팩토링에서 손대지 않는다** —
      바꿀 때는 지도 검증과 한 단위로 한다.

    # params
    db: 세션<br>
    plot_ids: `stn:108` 꼴의 목록. 빈 목록이면 질의하지 않는다<br>
    start: 시작일(포함)<br>
    end: 종료일(포함)<br>

    # returns
    (plot_id, tmax, tmin) 목록. 결측을 그대로 준다 — 하루치 GDD 를 못 내는 날을
    부르는 쪽이 세어야 "자료가 얼마나 채워졌나"를 알 수 있다

    # examples
        temps_in_range(db, ["stn:108"], 시작, 끝)  -> [('stn:108', 24.1, 15.2), ...]
    """
    if not plot_ids:
        return []
    rows = db.execute(
        select(WeatherDaily.plot_id, WeatherDaily.tmax, WeatherDaily.tmin).where(
            WeatherDaily.plot_id.in_(plot_ids),
            WeatherDaily.date >= start,
            WeatherDaily.date <= end,
        )
    ).all()
    return [(plot_id, tmax, tmin) for plot_id, tmax, tmin in rows]
