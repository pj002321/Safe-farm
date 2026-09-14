from sqlalchemy import Column, Float, Integer, String, UniqueConstraint

from app.core.db import Base


class Normal(Base):
    """normals. PK 후보 (station, month, day, source)."""

    __tablename__ = "normals"
    __table_args__ = (
        UniqueConstraint("station", "month", "day", "source", name="uq_normals_station_month_day_source"),
    )

    id = Column(Integer, primary_key=True)
    station = Column(String, nullable=False)
    month = Column(Integer, nullable=False)
    day = Column(Integer, nullable=False)
    tmax_normal = Column(Float)
    tmin_normal = Column(Float)
    rain_normal = Column(Float)
    source = Column(String, nullable=False)  # "kma" | "open-meteo-era5"
