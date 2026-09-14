"""weather_forecast 스키마. 격자 기준이고 누적되지 않는다.

소프트 삭제 예외 1. 지난 예보는 보관 가치가 없어 정리 배치가 하드 DELETE 한다.
해당 격자의 예측 날씨
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, func

from app.models.farm.base import FarmBase


class WeatherForecast(FarmBase):
    __tablename__ = "weather_forecast"

    # 어느 격자의 예보인지
    grid_id = Column(Integer, ForeignKey("grids.grid_id", ondelete="CASCADE"), primary_key=True)

    # 예보가 가리키는 날짜(수집일이 아니다). grid_id 와 묶어 PK 라
    # 같은 날짜를 다시 수집하면 새 행이 아니라 덮어쓴다
    fcst_date = Column(Date, primary_key=True)

    # 일 최고기온(℃). base_temp 와 함께 그날의 GDD 를 구하는 입력값.
    # 기상청은 해상 지역에 기온·강수를 안 주므로 NULL 이 올 수 있다
    temp_max = Column(Numeric(4, 1))

    # 일 최저기온(℃). GDD 계산의 나머지 입력값이자 서리 경고 판단에 쓴다
    temp_min = Column(Numeric(4, 1))

    # 일 강수량(mm). crop_stages.water_need_mm 와 비교해 관수 안내를 낸다
    rainfall_mm = Column(Numeric(5, 1))

    # 이 행을 수집한 시각. 예보는 갱신되므로 언제 받은 값인지 남긴다
    fetched_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
