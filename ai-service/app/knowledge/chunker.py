"""어떻게 자르는지. DB 는 모른다 — 저장은 pipeline 의 몫이다.

한도(EMBED_MAX_TOKENS)가 아니라 CHUNK_SIZE 로 자르는 이유: 한 조각에 주제가
여러 개 섞이면 벡터가 평균으로 뭉개져 검색이 흐려진다.
"""

import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import EMBED_TOKENIZER
from app.models.chunk import Chunk
from app.models.document import Document


CHUNK_SIZE = 480  # 토큰
CHUNK_OVERLAP = 48  # 경계에서 잘린 문맥을 다음 조각이 이어받는 분량
# 한국어는 공백이 문장 경계를 잘 안 알려준다. 종결어미('다'/'요')를 경계 후보로 넣는다.
SEPARATORS = ["\n\n", "\n", "다. ", "요. ", ". ", ", ", " ", ""]

_encoding = None
_splitter = None


def get_encoding():
    """
    # summary
    토큰 카운터. 만드는 비용이 커서 한 번만 만들고 계속 쓴다.

    # params
    없다. 인코딩 이름은 config 의 EMBED_TOKENIZER<br>

    # returns
    tiktoken 인코딩 객체. 매번 같은 인스턴스다

    # examples
        get_encoding().encode("상추")
    """
    global _encoding
    if _encoding is None:
        _encoding = tiktoken.get_encoding(EMBED_TOKENIZER)
    return _encoding


def count_tokens(text: str) -> int:
    """
    # summary
    임베딩 모델이 세는 방식으로 토큰 수를 센다. 글자 수와 다르다.

    # params
    text: 셀 문자열<br>

    # returns
    토큰 수. 빈 문자열이면 0

    # examples
        count_tokens(doc.content)  -> 73
    """
    return len(get_encoding().encode(text))


def get_splitter() -> RecursiveCharacterTextSplitter:
    """
    # summary
    분할기를 한 번만 만들어 재사용한다. 한국어는 공백이 문장 경계를 잘 알려주지
    않아 종결어미('다'/'요')를 경계 후보에 넣어 뒀다.

    # params
    없다. 규칙은 이 모듈의 CHUNK_SIZE·CHUNK_OVERLAP·SEPARATORS<br>

    # returns
    분할기 객체. 매번 같은 인스턴스다

    # examples
        get_splitter().split_text(long_text)  -> ['...', '...']
    """
    global _splitter
    if _splitter is None:
        # from_tiktoken_encoder 는 토크나이저 객체가 아니라 인코딩 '이름'을 받는다.
        _splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name=EMBED_TOKENIZER,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=SEPARATORS,
            keep_separator="end",
        )
    return _splitter


def split_text(text: str, title: str | None = None) -> list[tuple[str, int]]:
    """
    # summary
    텍스트를 조각으로 나눈다. CHUNK_SIZE 이하면 자르지 않는다. 모델 한도가 아니라
    CHUNK_SIZE 로 자르는 이유는, 한 조각에 주제가 여러 개 섞이면 벡터가 평균으로
    뭉개져 검색이 흐려지기 때문이다.

    # params
    text: 자를 본문<br>
    title: 조각마다 앞에 "[제목] " 으로 붙일 값. 실제로 잘렸을 때만 붙는다<br>

    # returns
    (조각, 토큰 수) 목록. 원문 순서를 지킨다. 자르지 않았으면 길이 1이고,
    그때는 title 도 붙지 않는다

    # examples
        split_text(doc.content, doc.title)  -> [('작물: 상추...', 73)]
    """
    n_tokens = count_tokens(text)
    if n_tokens <= CHUNK_SIZE:
        return [(text, n_tokens)]

    parts = get_splitter().split_text(text)
    if title:
        parts = [f"[{title}] {part}" for part in parts]
    return [(part, count_tokens(part)) for part in parts]


def split_into_chunks(document: Document) -> list[Chunk]:
    """
    # summary
    문서 하나를 Chunk 목록으로. embedding 은 비운 채로 둔다 — 채우는 것은 embed.py 다.

    # params
    document: 자를 문서. content 와 title 을 읽는다<br>

    # returns
    Chunk 목록. chunk_index 가 0부터 순서대로 붙고 embedding 은 전부 None.
    DB 에 넣는 것은 호출하는 쪽이다

    # examples
        split_into_chunks(doc)  -> [Chunk(chunk_index=0, n_tokens=73)]
    """
    return [
        Chunk(document_id=document.id, chunk_index=i, body=body, n_tokens=n_tokens)
        for i, (body, n_tokens) in enumerate(split_text(document.content, document.title))
    ]
