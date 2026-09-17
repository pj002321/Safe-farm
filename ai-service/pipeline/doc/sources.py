"""무엇을 임베딩할지. 소스가 늘면 고칠 파일은 여기 하나뿐이다.

쿼리 결과 한 행을 `{컬럼: 문자열}` 로 바꾼 뒤, 어느 컬럼을 본문·제목·식별자·메타로
쓸지 고른다. 그 다음 단계부터는 출처를 모른다.
"""

from dataclasses import dataclass

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.farm.crop import Crop
from app.models.farm.crop_guide import CropGuide
from app.models.farm.crop_stage import CropStage
from app.models.farm.crop_variant import CropVariant
from app.models.farm.variety import Variety
from app.models.farm.weekly_note import WeeklyNote


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
        # 심는 방법과 창. content_columns 에 안 넣으므로 meta 로 간다 —
        # 본문에 넣으면 모든 문서가 같은 모양이 되어 유사도가 흐려진다(아래 주석).
        # generator.build_context 가 '참고값' 줄로 붙여 LLM 에게 보낸다
        CropVariant.sow_method.label("sow_method"),
        CropVariant.sow_from.label("sow_from"),
        CropVariant.sow_to.label("sow_to"),
        Crop.base_temp.label("base_temp"),
        Crop.difficulty.label("difficulty"),
    )
    .join(CropVariant, CropVariant.crop_id == Crop.crop_id)
    .join(CropStage, CropStage.variant_id == CropVariant.variant_id)
    .order_by(CropVariant.variant_id, CropStage.stage_order)
)

# 품종 카탈로그. 한 품종이 문서 둘이다 — 요약(깨끗하고 짧다)과 본문(길고 찌꺼기가 남을 수 있다).
# 같은 variety_no 로 묶인다. 본문이 검색을 해치면 variety_body 만 빼면 된다
_VARIETY_COLUMNS = (
    Variety.crop_name.label("작물"),
    Variety.name.label("품종"),
    Variety.maturity_raw.label("숙기"),
    Variety.use.label("용도"),
    Variety.variety_no.label("variety_no"),
    Variety.crop_group.label("crop_group"),
    Variety.maturity_type.label("maturity_type"),
    Variety.bred_year.label("bred_year"),
    # ⚠ variant_id 를 싣지 않는다. build_meta 가 본문·제목·식별자에 안 쓴 컬럼을 전부
    #   meta 로 보내고, generator.build_context 가 그 meta 를 "참고값:" 으로 프롬프트에
    #   붙인다. 내부 DB 키가 거기 끼면 LLM 이 "variant_id 22" 를 답에 쓴다.
    #   GDD 엔진과의 연결은 varieties 테이블이 이미 갖고 있다 — 검색에는 필요 없다
)

_VARIETY_SUMMARY_QUERY = (
    select(*_VARIETY_COLUMNS, Variety.summary.label("주요특성"))
    .where(Variety.summary.is_not(None))
    .order_by(Variety.variety_no)
)

_VARIETY_BODY_QUERY = (
    select(*_VARIETY_COLUMNS, Variety.body.label("본문"))
    .where(Variety.body.is_not(None))
    .order_by(Variety.variety_no)
)

_CROP_GUIDE_QUERY = (
    select(
        CropGuide.crop_name.label("작물"),
        CropGuide.cultivation_type.label("작형"),
        CropGuide.section.label("구분"),
        CropGuide.topic.label("주제"),
        CropGuide.body.label("본문"),
        CropGuide.source_file.label("source_file"),
    )
    .order_by(CropGuide.crop_name, CropGuide.cultivation_type,
              CropGuide.section, CropGuide.topic)
)

_WEEKLY_QUERY = (
    select(
        WeeklyNote.topic.label("주제"),
        WeeklyNote.crops.label("작물"),
        WeeklyNote.body.label("본문"),
        WeeklyNote.issue_year.label("issue_year"),
        WeeklyNote.issue_no.label("issue_no"),
        WeeklyNote.ordinal.label("ordinal"),
        WeeklyNote.period_from.label("period_from"),
        WeeklyNote.period_to.label("period_to"),
    )
    .order_by(WeeklyNote.issue_year, WeeklyNote.issue_no, WeeklyNote.ordinal)
)

SOURCES: tuple[DbEmbedSource, ...] = (
    DbEmbedSource(
        name="crop_stage",
        statement=_CROP_STAGE_QUERY,
        # 숫자는 본문에 안 넣는다 — 모든 문서가 같은 모양이 되어 유사도가 내용과 무관해진다.
        content_columns=("작물", "숙기", "생육단계", "관리요령"),
        id_columns=("variant_id", "stage_order"),
        title_columns=("작물", "숙기", "생육단계"),
    ),
    DbEmbedSource(
        name="variety_summary",
        statement=_VARIETY_SUMMARY_QUERY,
        # 숙기·용도는 본문에 넣는다 — "극조생" "장류용" 이 검색어가 된다. 숫자 라벨(gdd) 과 다르다
        content_columns=("작물", "품종", "숙기", "용도", "주요특성"),
        id_columns=("variety_no",),
        title_columns=("작물", "품종"),
    ),
    DbEmbedSource(
        name="variety_body",
        statement=_VARIETY_BODY_QUERY,
        content_columns=("작물", "품종", "본문"),
        id_columns=("variety_no",),
        title_columns=("작물", "품종"),   # 잘릴 때 조각마다 "[고추 원강7호] " 가 붙는다
    ),
    DbEmbedSource(
        name="crop_guide",
        statement=_CROP_GUIDE_QUERY,
        # 작형·구분을 본문에 넣는다 — "촉성재배" "기상재해대책" 이 그대로 검색어가 된다.
        # 숫자도 빼지 않는다: "낮 22~30℃" 는 문장 안에 있어 crop_stage 의 gdd_target 라벨과 다르다
        content_columns=("작물", "작형", "구분", "주제", "본문"),
        # 자연키. guide_id 는 Identity 라 표를 다시 만들면 바뀐다
        id_columns=("작물", "작형", "구분", "주제"),
        title_columns=("작물", "작형", "주제"),
    ),
    DbEmbedSource(
        name="weekly_note",
        statement=_WEEKLY_QUERY,
        # 주제·작물을 본문에 넣는다 — '노지고추' '마늘,양파' 가 그대로 검색어가 된다
        content_columns=("주제", "작물", "본문"),
        id_columns=("issue_year", "issue_no", "ordinal"),
        title_columns=("issue_year", "issue_no", "주제"),
        # period_from/to 는 meta 로 간다(build_meta 가 안 쓴 칸을 담는다).
        # 시기 필터가 그걸 읽는다 — 다음 단계
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
    id_columns 값을 ':' 로 이은 문자열. 빈 값도 빈 조각으로 자리를 지킨다.
    선언한 컬럼이 없으면 line_no 를 문자열로 — 쿼리 순서가 바뀌면 행 번호도 바뀌므로
    id_columns 를 주는 편이 안전하다

    # examples
        build_external_id(source, row, 1)  -> '1:1'
    """
    if not source.id_columns:
        return str(line_no)
    # 빈 조각도 자리를 지킨다 — '고추::재배법:모 기르기'. 건너뛰면 작형 유무가 다른 두 행이
    # 같은 열쇠가 되어 서로를 덮어쓴다. crop_stage 의 '1:1' 은 빈 값이 없어 그대로다
    return ":".join(row.get(col, "").strip() for col in source.id_columns)


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
    meta = {col: row[col] for col in columns if row.get(col, "").strip()}
    # ★ 작물은 본문에도 있지만 meta 에도 넣는다. 검색이 작물로 후보를 줄이려면(vector_store 의
    #   crops 인자) 필터를 걸 자리가 필요한데, 본문은 텍스트라 LIKE 밖에 못 쓰고 그건 취약하다.
    #   모든 소스가 첫 컬럼을 '작물' 로 label 하고 있어 이 한 줄이 네 소스에 다 걸린다
    작물 = row.get("작물", "").strip()
    if 작물:
        meta["작물"] = 작물
        # ⚠ 배열로도 넣는다. weekly_notes.crops 는 '마늘,양파' 처럼 여럿이라 문자열 일치
        #   필터(.in_)로는 '마늘' 검색에 안 걸린다. JSONB 배열이면 ?| 로 겹침을 본다.
        #   pest_bulletins 도 작물이 여럿이라 같은 문제가 또 온다 — 여기서 한 번에 막는다.
        #   이 키는 사람이 읽을 값이 아니라 generator 가 '참고값' 에서 뺀다
        meta["작물들"] = [c.strip() for c in 작물.split(",") if c.strip()]
    return meta
