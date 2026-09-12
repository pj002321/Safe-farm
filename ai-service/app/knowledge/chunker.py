"""어떻게 자르는지 : Document를 섹션/문단 단위로 자르는 곳입니다."""

from app.models.chunk import Chunk
from app.models.document import Document


def split_into_chunks(document: Document) -> list[Chunk]:
    """TODO: document.content를 섹션/문단 단위로 나눠 Chunk 목록으로 반환"""
    raise NotImplementedError
