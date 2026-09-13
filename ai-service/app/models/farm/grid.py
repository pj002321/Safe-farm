"""grids 스키마. 전국 격자를 미리 넣지 않고, 밭이 생길 때 필요한 것만 추가한다.
좌표 -> 하나의 grid_id로 보기
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    Identity,
    Integer,
    SmallInteger,
    UniqueConstraint,
)

from app.models.farm.base import FarmBase


class Grid(FarmBase):
    __tablename__ = "grids"

    # nx/ny 두 컬럼을 여기저기서 들고 다니지 않으려고 대리키를 둔다
    grid_id = Column(Integer, Identity(always=True), primary_key=True)

    # 기상청 단기예보 격자 X 좌표. 위경도를 변환해서 얻는다
    nx = Column(SmallInteger, nullable=False)

    # 기상청 단기예보 격자 Y 좌표
    ny = Column(SmallInteger, nullable=False)

    __table_args__ = (
        # 같은 격자를 두 번 만들지 않는다. 밭 등록 때 upsert 의 충돌 기준이 된다
        UniqueConstraint("nx", "ny", name="uq_grids_nx_ny"),
        # 범위 근거: 기상청 단기예보 활용가이드 좌표변환 예제
        CheckConstraint("nx between 1 and 149", name="ck_grids_nx"),
        CheckConstraint("ny between 1 and 253", name="ck_grids_ny"),
    )
