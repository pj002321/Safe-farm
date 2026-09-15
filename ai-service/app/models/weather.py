from sqlalchemy import Column, Float, Integer, String, Date, UniqueConstraint

from app.core.db import Base


class WeatherDaily(Base):
    """weather_daily. PK 후보 (plot_id, date, source)."""

    __tablename__ = "weather_daily"
    __table_args__ = (UniqueConstraint("plot_id", "date", "source", name="uq_weather_daily_plot_date_source"),)

    id = Column(Integer, primary_key=True)
    plot_id = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    kind = Column(String, nullable=False)  # "obs" | "fcst"
    tmax = Column(Float)
    tmin = Column(Float)
    tmean = Column(Float)
    rain = Column(Float)
    wind_max = Column(Float)
    lst_min = Column(Float)  # 천리안 지표면온도 (2차, 기상청 전용)
    source = Column(String, nullable=False)  # "kma" | "open-meteo"
