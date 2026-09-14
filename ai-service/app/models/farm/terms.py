"""terms 스키마. 버전마다 한 행이라, 개정은 UPDATE 가 아니라 INSERT 다.

기존 행을 고치면 그 약관에 동의했던 사용자가 무엇에 동의했는지 알 수 없게 된다.
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Identity,
    Integer,
    Text,
    UniqueConstraint,
)

from app.models.farm.base import FarmBase


class Terms(FarmBase):
    __tablename__ = "terms"

    terms_id = Column(Integer, Identity(always=True), primary_key=True)

    # 약관 종류. TERMS 이용약관 / PRIVACY 개인정보 / LOCATION 위치정보 / MARKETING 마케팅
    type = Column(Text, nullable=False)

    # 개정 버전(v1.0, v1.1 …). type 과 묶어 이 행을 사람이 식별하는 자연키
    version = Column(Text, nullable=False)

    # 가입에 필수인지. false 면 거부해도 가입이 된다
    is_required = Column(Boolean, nullable=False)

    # 이 버전이 효력을 갖는 시각. 개정판을 미리 넣어두고 이 시각부터 보여준다
    effective_at = Column(DateTime(timezone=True), nullable=False)

    # 약관 전문이 있는 위치. 본문을 DB 에 넣지 않는다
    content_url = Column(Text)

    __table_args__ = (
        # 같은 종류에 같은 버전이 둘일 수 없다
        UniqueConstraint("type", "version", name="uq_terms_type_version"),
        CheckConstraint(
            "type in ('TERMS','PRIVACY','LOCATION','MARKETING')", name="ck_terms_type"
        ),
    )
