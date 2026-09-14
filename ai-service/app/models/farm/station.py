"""stations 스키마. 과거 실측 기온을 가져오는 관측소.

미결정: 관측망(ASOS/AWS/농업기상)이 안 정해져서 station_code 를 text 로 둔다.
"""

from sqlalchemy import Column, Numeric, Text

from app.models.farm.base import FarmBase


class Station(FarmBase):
    __tablename__ = "stations"

    # 기상청이 부여한 관측소 번호. 외부에서 이미 고유해서 대리키를 두지 않았다
    station_code = Column(Text, primary_key=True)

    # 관측소 지점명(서울·수원 등)
    name = Column(Text, nullable=False)

    # 관측소 위도. 밭에서 가장 가까운 관측소를 고를 때 쓴다
    latitude = Column(Numeric(9, 6), nullable=False)

    # 관측소 경도
    longitude = Column(Numeric(9, 6), nullable=False)
