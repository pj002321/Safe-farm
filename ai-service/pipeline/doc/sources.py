"""무엇을 임베딩할지. 소스가 늘면 고칠 파일은 여기 하나뿐이다.

쿼리 결과 한 행을 `{컬럼: 문자열}` 로 바꾼 뒤, 어느 컬럼을 본문·제목·식별자·메타로
쓸지 고른다. 그 다음 단계부터는 출처를 모른다.
"""

from dataclasses import dataclass

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.farm.crop import Crop
from app.models.farm.crop_stage import CropStage
from app.models.farm.crop_variant import CropVariant


@dataclass(frozen=True)
class DbEmbedSource:
    """쿼리 결과 한 행 = 문서 한 건.

    컬럼 이름이 곧 본문 라벨이라, 쿼리에서 `.label("관리요령")` 으로 한국어를 준다.
    """

    name: str  # documents.source 에 들어갈 이름
    statement: Select
    content_columns: tuple[str, ...]  # 이어 붙여 본문으로. 임베딩되는 것은 이것뿐이다
    id_columns: tuple[str, ...] = ()  # 여러 개면 ':' 로 이어 식별자를 만든다
    title_columns: tuple[str, ...] = ()  # 여러 개면 공백으로 이어 붙인다
    meta_columns: tuple[str, ...] = ()  # 비우면 나머지 전부


# 작물 > 숙기 > 생육단계. 단계 하나가 문서 하나다.
_CROP_STAGE_QUERY = (
    select(
        Crop.name.label("작물"),
        CropVariant.maturity_type.label("숙기"),
        CropStage.stage_name.label("생육단계"),
        CropStage.guide_text.label("관리요령"),
        CropVariant.variant_id.label("variant_id"),
        CropStage.stage_order.label("stage_order"),
        CropStage.gdd_from.label("gdd_from"),
        CropStage.gdd_to.label("gdd_to"),
        CropStage.water_need_mm.label("water_need_mm"),
        CropStage.fertilize_needed.label("fertilize_needed"),
        CropVariant.gdd_target.label("gdd_target"),
        CropVariant.days_to_harvest.label("days_to_harvest"),
        Crop.base_temp.label("base_temp"),
        Crop.difficulty.label("difficulty"),
    )
    .join(CropVariant, CropVariant.crop_id == Crop.crop_id)
    .join(CropStage, CropStage.variant_id == CropVariant.variant_id)
    .order_by(CropVariant.variant_id, CropStage.stage_order)
)

# TODO: 팀 문서가 오면 여기 추가한다. 파일로 오면 read_rows 에 분기가 필요하다.
SOURCES: tuple[DbEmbedSource, ...] = (
    DbEmbedSource(
        name="crop_stage",
        statement=_CROP_STAGE_QUERY,
        # 숫자는 본문에 안 넣는다 — 모든 문서가 같은 모양이 되어 유사도가 내용과 무관해진다.
        content_columns=("작물", "숙기", "생육단계", "관리요령"),
        id_columns=("variant_id", "stage_order"),
        title_columns=("작물", "숙기", "생육단계"),
    ),
)


def read_rows(source: DbEmbedSource, db: Session) -> list[dict[str, str]]:
    """
    # summary
    소스의 쿼리를 실행해 dict 목록으로 바꾼다. 값은 전부 문자열로 맞춘다 —
    meta 가 JSONB 라 원문 그대로 담는 편이 낫다.

    # params
    source: 실행할 소스<br>
    db: 세션<br>

    # returns
    행 목록. 쿼리의 order_by 순서를 지킨다. 키는 .label() 로 준 컬럼 이름이고,
    NULL 인 값은 빈 문자열이 된다

    # examples
        read_rows(SOURCES[0], db)
        -> [{'작물': '상추', '숙기': 'EARLY', 'variant_id': '1', ...}, ...]
    """
    return [
        {key: "" if value is None else str(value) for key, value in row.items()}
        for row in db.execute(source.statement).mappings()
    ]


def build_content(source: DbEmbedSource, row: dict[str, str]) -> str:
    """
    # summary
    본문 조립. 컬럼명을 라벨로 같이 남긴다 — '수확기: 9월' 이 '9월' 보다 검색에 잡힌다.

    # params
    source: content_columns 를 읽을 소스<br>
    row: read_rows 가 만든 행 하나<br>

    # returns
    "라벨: 값" 을 줄바꿈으로 이은 문자열. 임베딩되는 것은 이 값뿐이다.
    값이 빈 컬럼은 빠지고, 전부 비면 빈 문자열 — 호출하는 쪽이 그 행을 건너뛴다

    # examples
        build_content(source, row)
        -> '작물: 상추 / 숙기: EARLY / 생육단계: 발아 / 관리요령: 흙이...'   # / 는 줄바꿈
    """
    return "\n".join(
        f"{col}: {row[col].strip()}" for col in source.content_columns if row.get(col, "").strip()
    )


def build_title(source: DbEmbedSource, row: dict[str, str]) -> str | None:
    """
    # summary
    제목 조립. 문서가 잘릴 때 각 조각 앞에 "[제목] " 으로 붙어 같이 임베딩된다.
    잘리지 않으면 붙지 않는다.

    # params
    source: title_columns 를 읽을 소스<br>
    row: read_rows 가 만든 행 하나<br>

    # returns
    공백으로 이은 제목. title_columns 가 비었거나 값이 전부 비면 None

    # examples
        build_title(source, row)  -> '상추 EARLY 발아'
    """
    parts = [row[col].strip() for col in source.title_columns if row.get(col, "").strip()]
    return " ".join(parts) or None


def build_external_id(source: DbEmbedSource, row: dict[str, str], line_no: int) -> str:
    """
    # summary
    원본 한 행을 알아보는 값. documents.external_id 에 들어가고, (source, external_id)
    로 재실행 때 같은 행인지 판단한다 — 증분 색인의 출발점이다.

    # params
    source: id_columns 를 읽을 소스<br>
    row: read_rows 가 만든 행 하나<br>
    line_no: 1부터 세는 행 번호. id_columns 가 없을 때만 쓴다<br>

    # returns
    id_columns 값을 ':' 로 이은 문자열. 선언한 컬럼이 없으면 line_no 를 문자열로.
    쿼리 순서가 바뀌면 행 번호도 바뀌므로 id_columns 를 주는 편이 안전하다

    # examples
        build_external_id(source, row, 1)  -> '1:1'
    """
    parts = [row[col].strip() for col in source.id_columns if row.get(col, "").strip()]
    return ":".join(parts) or str(line_no)


def build_meta(source: DbEmbedSource, row: dict[str, str]) -> dict[str, str]:
    """
    # summary
    본문에 넣지 않은 나머지 컬럼. documents.meta(JSONB) 에 들어가 출처 표시와
    필터링에 쓴다.

    # params
    source: meta_columns 를 읽을 소스. 비어 있으면 본문·제목·식별자에 안 쓴 컬럼 전부<br>
    row: read_rows 가 만든 행 하나<br>

    # returns
    컬럼 이름 -> 값. 값이 전부 문자열이라 숫자로 비교하려면 캐스팅해야 한다.
    빈 값인 컬럼은 빠진다

    # examples
        build_meta(source, row)
        -> {'gdd_from': '0', 'gdd_to': '80', 'base_temp': '4.0', ...}
    """
    if source.meta_columns:
        columns = source.meta_columns
    else:
        used = {*source.content_columns, *source.id_columns, *source.title_columns}
        columns = tuple(c for c in row if c not in used)
    return {col: row[col] for col in columns if row.get(col, "").strip()}
