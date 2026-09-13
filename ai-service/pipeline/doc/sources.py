"""무엇을 읽을지. CSV 컬럼이 확정되면 고칠 파일은 여기 하나뿐이다."""

import csv
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import DATA_DIR


@dataclass(frozen=True)
class CsvSource:
    name: str  # documents.source 에 들어갈 이름
    path: Path
    content_columns: tuple[str, ...]  # 이어 붙여 본문으로 쓸 컬럼
    id_column: str | None = None  # 원본 행 식별자. None 이면 행 번호를 쓴다
    title_column: str | None = None
    meta_columns: tuple[str, ...] = field(default_factory=tuple)  # 비우면 나머지 전부


# TODO: 실제 CSV 가 정해지면 이 목록을 고친다. 지금 값은 모양을 보여주는 예시다.
SOURCES: tuple[CsvSource, ...] = (
    CsvSource(
        name="crop_guide",
        path=DATA_DIR / "crop_guide.csv",
        content_columns=("설명", "재배방법"),
        id_column="작물코드",
        title_column="작물명",
    ),
)


def read_rows(source: CsvSource) -> list[dict[str, str]]:
    """CSV 를 dict 목록으로. 캐스팅하지 않는다 — meta 는 JSONB 라 원문이 낫다."""
    if not source.path.exists():
        raise FileNotFoundError(f"{source.path} 가 없습니다. data/ 에 CSV 를 넣으세요.")

    with source.path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        # 조용히 건너뛰면 본문이 빈 문서가 대량으로 생긴다
        declared = {
            *source.content_columns,
            *(c for c in (source.id_column, source.title_column) if c),
            *source.meta_columns,
        }
        missing = sorted(declared - set(header))
        if missing:
            raise ValueError(f"{source.path.name}: 선언한 컬럼이 CSV 에 없습니다 {missing}")
        return list(reader)


def build_content(source: CsvSource, row: dict[str, str]) -> str:
    """본문 조립. 컬럼명을 같이 남긴다 — '수확기: 9월' 이 '9월' 보다 검색에 잡힌다."""
    return "\n".join(
        f"{col}: {row[col].strip()}"
        for col in source.content_columns
        if row.get(col, "").strip()
    )


def build_meta(source: CsvSource, row: dict[str, str]) -> dict[str, str]:
    """본문에 안 넣은 나머지. 출처 표시와 필터링에 쓴다."""
    if source.meta_columns:
        columns = source.meta_columns
    else:
        used = {*source.content_columns, source.id_column, source.title_column}
        columns = tuple(c for c in row if c not in used)
    return {col: row[col] for col in columns if row.get(col, "").strip()}
