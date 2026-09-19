from sqlalchemy import Column, Float, Integer, String, UniqueConstraint

from app.core.db import Base


class Normal(Base):
    """normals. PK 후보 (station, month, day, source)."""

    __tablename__ = "normals"
    __table_args__ = (
        UniqueConstraint(
            "station", "month", "day", "source", name="uq_normals_station_month_day_source"
        ),
    )

    id = Column(Integer, primary_key=True)
    station = Column(String, nullable=False)
    month = Column(Integer, nullable=False)
    day = Column(Integer, nullable=False)
    tmax_normal = Column(Float)
    tmin_normal = Column(Float)
    rain_normal = Column(Float)
    # 실제로 들어 있는 값은 "kma"(최신 30년, 174곳) 과 "kma-1981"(1981~2010, 72곳)
    # 두 가지다. 70곳은 양쪽에 다 있다 — **읽는 쪽은 반드시 source 를 걸어야 한다.**
    # 안 걸면 기간이 다른 두 벌을 섞어 평균 내게 된다.
    source = Column(String, nullable=False)
