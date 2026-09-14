"""user_agreements 스키마. 누가 어느 약관 버전에 동의했는지를 남기는 증빙.

철회는 withdrawn_at 이고 deleted_at 을 쓰지 않는다. 동의했다가 철회한 사실 자체가
기록이라, 행을 지우면 증빙이 사라진다.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class UserAgreement(FarmBase):
    __tablename__ = "user_agreements"

    # 동의한 사용자
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )

    # 동의한 약관 버전. terms 의 버전마다 행이 따로라, 어느 문안에 동의했는지가 특정된다.
    # user_id 와 묶어 PK 라 같은 버전에 두 번 동의할 수 없다
    terms_id = Column(Integer, ForeignKey("terms.terms_id"), primary_key=True)

    # 동의한 시각
    agreed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # 철회 시각. NULL 이면 동의가 유효하다. 마케팅 수신 거부가 여기 해당한다
    withdrawn_at = Column(DateTime(timezone=True))

    # "이 약관에 동의한 사람 전부" 를 찾는 조회용. FK 는 반대 방향만 빠르다
    __table_args__ = (Index("ix_user_agreements_terms", "terms_id"),)
