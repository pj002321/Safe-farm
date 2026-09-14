"""weather_obs_daily 스키마. 관측소 기준의 지나간 날씨.

격자 예보 API 는 최근 1일까지만 조회되므로 과거 기온은 반드시 여기서 읽는다.
이미 관측된 정보
"""

from sqlalchemy import Column, Date, ForeignKey, Numeric, Text

from app.models.farm.base import FarmBase


class WeatherObsDaily(FarmBase):
    __tablename__ = "weather_obs_daily"

    # 어느 관측소의 실측인지. 예보와 달리 격자가 아니라 지점 단위다.
    # CASCADE 를 걸지 않은 건 관측소가 없어져도 이미 관측한 기록은 남겨야 해서다
    station_code = Column(Text, ForeignKey("stations.station_code"), primary_key=True)

    # 관측한 날짜. 예보의 fcst_date 와 달리 이미 지나간 날이라 값이 바뀌지 않는다
    obs_date = Column(Date, primary_key=True)

    # 일 최고기온(℃) 실측. 파종일부터 오늘까지 GDD 를 되짚어 계산할 때 쓴다
    temp_max = Column(Numeric(4, 1))

    # 일 최저기온(℃) 실측
    temp_min = Column(Numeric(4, 1))

    # 일 강수량(mm) 실측. 관측되지 않은 날은 NULL
    rainfall_mm = Column(Numeric(5, 1))
