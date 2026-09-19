"""satellite_observations 스키마. 좌표 한 곳을 위성이 본 날의 기록.

`weather_obs_daily` 와 같은 결이다 — 밖(Sentinel Hub)에 묻는 일과 화면에 그리는
일을 갈라 놓는다. 기온·강수는 이미 그렇게 돌고 있었고 위성만 볼 때마다 밖에 물었다.

⚠ 실시간일 이유가 없는 값이다. 구름과 재방문 주기 때문에 **관측이 평균 18일에
  한 번**밖에 안 남는다(2026-09-19 실측 · pipeline/sentinelhub_client.py 머리).
  하루에 몇 번을 물어도 같은 답이 온다.

⚠ **밭이 아니라 좌표로 묶는다.** 부르는 쪽(app/api/satellite.py)이 좌표를 받는
  API 라 그 계약을 그대로 두려는 것이다. 좌표는 소수 4자리로 반올림한다 —
  약 11m 로, Sentinel-2 화소(10m)·조회 폴리곤 반폭(15m)과 같은 눈금이다.
  그보다 잘게 나누면 같은 밭이 매번 다른 열쇠가 되어 표가 쓸모없어진다.
"""

from sqlalchemy import Column, Date, DateTime, Numeric

from app.models.farm.base import FarmBase


class SatelliteObservation(FarmBase):
    """관측된 것만 들어간다. 못 본 날은 행이 없다(0 이 아니라 없음이다)."""

    __tablename__ = "satellite_observations"

    # 소수 4자리로 반올림한 좌표. 넣는 쪽·읽는 쪽이 같은 자리로 맞춰야 한다
    # (app/service/satellite_cache.COORD_NDIGITS)
    lat = Column(Numeric(8, 4), primary_key=True)
    lon = Column(Numeric(9, 4), primary_key=True)

    # 위성이 지나간 날. 이미 관측된 값이라 나중에 바뀌지 않는다
    obs_date = Column(Date, primary_key=True)

    # 잎이 우거진 정도(-1~1). 밭이 아닌 좌표(물·건물)는 음수가 나온다
    ndvi = Column(Numeric(4, 3))

    # 잎 속 수분(-1~1)
    ndmi = Column(Numeric(4, 3))


class SatelliteFetch(FarmBase):
    """**언제 물어봤나.** 관측 표만으로는 이걸 알 수 없다.

    구름에 가려 90일에 한 점도 없을 수 있어서(최장 공백 32일 실측), "행이 없다"가
    *아직 안 물어봤다* 인지 *물어봤는데 없다* 인지 구분되지 않는다. 그 둘을 못
    가르면 관측 없는 좌표는 요청마다 Sentinel Hub 를 다시 부른다.
    """

    __tablename__ = "satellite_fetches"

    lat = Column(Numeric(8, 4), primary_key=True)
    lon = Column(Numeric(9, 4), primary_key=True)

    # 이 좌표로 받아 둔 구간의 시작일. 더 옛날을 물으면 캐시가 모자라 다시 받는다
    covered_from = Column(Date, nullable=False)

    # 마지막으로 물어본 때. 이 값이 오래되면 새 관측이 생겼을 수 있어 다시 받는다
    fetched_at = Column(DateTime(timezone=True), nullable=False)
