"""documents 스키마. 쿼리 결과 한 행 = 문서 한 건.

역추적: source 로 sources.py 에서 소스 찾고, external_id 를 ':' 로 자르면
id_columns 값 나옴. 'crop_stage' + '1:1' -> variant_id=1, stage_order=1.
"""

from sqlalchemy import Column, DateTime, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.db import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)

    # (source, external_id) 로 원본 한 행 알아봄. 같은 쿼리 다시 돌려도 중복 안 됨.
    source = Column(Text, nullable=False)  # sources.py 의 DbEmbedSource.name

    # "어느 행인가" 만 담당. crop_stage 는 crop_stages 의 (variant_id, stage_order) -> '1:1'.
    # 이름 아니고 번호임 — crops.name 바뀌어도 같은 행으로 찾아 UPDATE 함.
    # 약간 상추, 숙기 -> 각 아이디가 1, 1이면 1:1로 저장
    external_id = Column(Text, nullable=False)

    title = Column(Text)  # 사람이 읽는 이름. 잘릴 때만 조각 앞에 붙어 같이 임베딩됨
    content = Column(Text, nullable=False)  # 임베딩 대상. content_columns 만 조립함

    # content_columns 에 안 넣은 나머지. 숫자 본문에 넣으면 문서가 다 비슷해져 검색 흐려짐.
    # 보여주기·필터링용인데 아직 읽는 코드 없음.
    meta = Column(JSONB, nullable=False, server_default="{}")

    # 재임베딩 스위치. 대상은 content 뿐 — meta 만 바뀌면 재임베딩 안 함.
    content_hash = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 본문 바뀌면 조각 통째로 버림. 남기면 본문과 어긋난 벡터가 검색에 섞임.
    chunks = relationship(
        "Chunk",
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_documents_source_row"),)
