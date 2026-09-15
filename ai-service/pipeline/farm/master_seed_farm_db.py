"""data/dummy/*.csv -> farm 마스터 테이블. 사람이 관리하는 기준 정보다.

마스터는 운영 중에 스스로 늘지 않는다. 작물 도메인(crops·crop_variants·crop_stages),
기상청 격자와 관측소 목록(grids·stations) 이 여기 속한다.
날씨 실측·예보는 런타임에 들어오므로 여기서 다루지 않는다 — seed_farm_db.py.

약관(terms)·동의(user_agreements)·회원·텃밭은 Next.js 몫이라 이 파이프라인이 건드리지
않는다. ORM 정의는 남아 있지만 적재 대상이 아니다.

crop_id 같은 identity 값은 CSV 에 없다. 부모를 먼저 넣고 조회해서 자식에 채운다.
CSV 를 고치고 다시 돌리면 그 값이 DB 에 반영된다.

실행: py -3.12 -m pipeline.farm.master_seed_farm_db
      py -3.12 -m pipeline.farm.master_seed_farm_db --check   DB 없이 CSV 만 검사
"""

import sys

from sqlalchemy import select

from app.core.config import DATA_DIR
from app.core.db import get_engine, new_session
from app.models.farm import Crop, CropStage, CropVariant, Grid, Station
from pipeline.prep.seeding import Ref, check_refs, count_rows, read_all, report, require_tables
from pipeline.prep.table import key_dict, upsert

DUMMY_DIR = DATA_DIR / "dummy"
INIT_HINT = "py -3.12 -m pipeline.farm.init_farm_db"

# 넣는 순서. 부모가 먼저다
TABLES = [
    "crops",
    "crop_variants",
    "crop_stages",
    "grids",
    "stations",
]


def refs(data: dict[str, list[dict]]) -> list[Ref]:
    """
    # summary
    마스터 안에서 서로 가리키는 관계를 모은다. 작물 계층 둘뿐이고,
    grids·stations 는 가리키는 대상이 없다.

    # params
    data: read_all 결과<br>

    # returns
    Ref 목록 2개. 작물 계층뿐이라 grids·stations·terms 는 빠진다

    # examples
        check_refs(refs(data))  -> 자연키 전부 해석됨
    """
    crops = {r["name"] for r in data["crops"]}
    variants = {(r["crop_name"], r["maturity_type"]) for r in data["crop_variants"]}

    return [
        ("crop_variants -> 작물", data["crop_variants"], lambda r: r["crop_name"], crops),
        (
            "crop_stages -> 품종",
            data["crop_stages"],
            lambda r: (r["crop_name"], r["maturity_type"]),
            variants,
        ),
    ]


def load(db, data: dict[str, list[dict]]) -> dict[str, int]:
    """
    # summary
    TABLES 순서대로 upsert 한다. 부모를 먼저 넣고 flush 한 뒤, 그때 발급된
    identity id 를 key_dict 로 찾아 자식 행에 채운다. 끝에 commit 한다.

    # params
    db: 세션<br>
    data: read_all 결과<br>

    # returns
    테이블 이름 -> 반영된 행 수. TABLES 의 키가 전부 들어 있다.
    upsert 라 "반영" 은 새로 넣은 것과 갱신한 것을 합친 수다

    # examples
        load(db, data)  -> {'crops': 8, 'crop_variants': 12, ...}
    """
    done: dict[str, int] = {}

    done["crops"] = upsert(db, Crop, data["crops"], ["name"])
    db.flush()
    crop_id = key_dict(db, select(Crop.name, Crop.crop_id))

    rows = [
        {
            "crop_id": crop_id[r["crop_name"]],
            "maturity_type": r["maturity_type"],
            "gdd_target": r["gdd_target"],
            "days_to_harvest": r["days_to_harvest"],
        }
        for r in data["crop_variants"]
    ]
    done["crop_variants"] = upsert(db, CropVariant, rows, ["crop_id", "maturity_type"])
    db.flush()

    variant_id = key_dict(
        db,
        select(Crop.name, CropVariant.maturity_type, CropVariant.variant_id).join(
            CropVariant, CropVariant.crop_id == Crop.crop_id
        ),
    )
    rows = [
        {
            "variant_id": variant_id[(r["crop_name"], r["maturity_type"])],
            "stage_order": r["stage_order"],
            "stage_name": r["stage_name"],
            "gdd_from": r["gdd_from"],
            "gdd_to": r["gdd_to"],
            "water_need_mm": r["water_need_mm"],
            "fertilize_needed": r["fertilize_needed"] == "true",
            "guide_text": r["guide_text"],
        }
        for r in data["crop_stages"]
    ]
    done["crop_stages"] = upsert(db, CropStage, rows, ["variant_id", "stage_order"])

    # 컬럼이 nx, ny 뿐이라 갱신할 것이 없다. 충돌하면 건너뛴다
    done["grids"] = upsert(db, Grid, data["grids"], ["nx", "ny"])
    done["stations"] = upsert(db, Station, data["stations"], ["station_code"])

    db.commit()
    return done


def main() -> None:
    """
    # summary
    마스터 CSV 를 읽어 적재한다. --check 면 DB 를 열지 않고 검사만 한다.
    테이블이 아직 없으면 이름을 찍고 멈춘다.

    # params
    없다. 옵션은 argv 에서 읽는다 — --check<br>

    # examples
        py -3.12 -m pipeline.farm.master_seed_farm_db --check
        py -3.12 -m pipeline.farm.master_seed_farm_db
    """
    data = read_all(DUMMY_DIR, TABLES)

    if "--check" in sys.argv:
        count_rows(data, TABLES)
        check_refs(refs(data))
        return

    require_tables(get_engine(), TABLES, INIT_HINT)

    db = new_session()
    try:
        done = load(db, data)
    finally:
        db.close()

    report(data, TABLES, done)


if __name__ == "__main__":
    main()
