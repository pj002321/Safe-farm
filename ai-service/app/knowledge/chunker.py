"""어떻게 자르는지 : Document를 섹션/문단 단위로 자르는 곳입니다."""
import tiktoken

from app.core.config import EMBED_TOKENIZER
from app.models.chunk import Chunk
from app.models.document import Document

_encoding = tiktoken.get_encoding(EMBED_TOKENIZER)
def split_into_chunks(document: Document) -> list[Chunk]:
    """Docu를 받아서 줄바꿈으로 Split후 Chunk리스트로 반환."""
    chunks = []
    for line in document.content.split("\n"):
        line = line.strip()
        if not line:
            continue
        chunks.append(
            Chunk(document_id=document.id, body=line, n_tokens=len(_encoding.encode(line)))
        )
    return chunks
