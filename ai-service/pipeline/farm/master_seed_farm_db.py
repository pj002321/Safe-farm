"""data/master/*.csv -> farm 마스터 테이블. 사람이 관리하는 기준 정보다.

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
from app.models.farm import Crop, CropDisasterRule, CropStage, CropVariant, Grid, Station
from pipeline.prep import check
from pipeline.prep.seeding import count_rows, read_all, report, require_tables
from pipeline.prep.table import key_dict, upsert

# 마스터는 실측값이다. 더미(런타임 대체용 가짜)와 섞으면 어느 쪽이 버려도 되는
# 값인지 구분이 사라진다 — data/dummy/README.md 가 "전부 가짜"라고 선언한다
MASTER_DIR = DATA_DIR / "master"
INIT_HINT = "py -3.12 -m pipeline.farm.init_farm_db"

# 넣는 순서. 부모가 먼저다
TABLES = [
    "crops",
    "crop_variants",
    "crop_stages",
    "crop_disaster_rules",
    "grids",
    "stations",
]

# CSV 안에서 겹치면 안 되는 컬럼 조합. DB 의 UNIQUE·PK 와 같은 조합이다
UNIQUE = [
    ("crops", ["name"]),
    ("crop_variants", ["crop_name", "maturity_type"]),
    ("crop_stages", ["crop_name", "maturity_type", "stage_order"]),
    # DB 의 UNIQUE 는 crop_id 로 걸리지만 CSV 는 자연키라 crop_name 으로 본다
    ("crop_disaster_rules", ["crop_name", "rule_kind", "stage_name", "severity"]),
    ("grids", ["nx", "ny"]),
    ("stations", ["station_code"]),
]

# 자식 -> 부모. identity id 는 적재 때 정해지므로 CSV 끼리는 자연키로 맞춰 본다.
# grids·stations 는 가리키는 대상이 없어 여기 없다
REFS = [
    ("crop_variants", ["crop_name"], "crops", ["name"]),
    (
        "crop_stages",
        ["crop_name", "maturity_type"],
        "crop_variants",
        ["crop_name", "maturity_type"],
    ),
    # 단계별 규칙이지만 부모는 crops 다 — stage_name 이 crop_stages 와 글자가
    # 다를 수 있어서(원문 표기 그대로) variant 를 거치지 않는다
    ("crop_disaster_rules", ["crop_name"], "crops", ["name"]),
]


def _int(value) -> int | None:
    """CSV 값은 전부 문자열이라 비교 전에 바꾼다. 숫자가 아니면 None 으로 알린다."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def stage_problems(data: dict[str, list[dict]]) -> list[str]:
    """
    # summary
    품종별로 단계가 0 에서 시작해 끊김 없이 이어지고, gdd_target 에서 끝나는지 본다.
    구간이 반개구간이라 앞 단계의 gdd_to 와 다음 단계의 gdd_from 이 같은 값이어야 한다.
    DB 는 행 하나씩만 보므로(ck_crop_stages_gdd_range) 이 검사를 대신하지 못한다 —
    구멍이 뚫린 채로 들어가면 그 구간에 걸린 밭이 단계 판정에서 빠진다.

    # params
    data: read_all 결과. crop_variants·crop_stages 가 있어야 한다<br>

    # returns
    위반 설명 한 줄씩. crop_variants 순서대로다. 이상이 없으면 빈 리스트

    # examples
        stage_problems(data)
        -> ['상추/EARLY 2단계: gdd_from 80, 앞 단계 gdd_to 100']
    """
    stages: dict[tuple[str, str], list[dict]] = {}
    for row in data["crop_stages"]:
        stages.setdefault((row["crop_name"], row["maturity_type"]), []).append(row)

    problems: list[str] = []
    for variant in data["crop_variants"]:
        key = (variant["crop_name"], variant["maturity_type"])
        name = f"{key[0]}/{key[1]}"

        rows = stages.get(key)
        if not rows:
            problems.append(f"{name}: 단계가 하나도 없다")
            continue

        # 숫자로 못 바꾸는 값이 섞이면 아래 비교가 전부 무의미해진다. 여기서 끊는다
        bad = [
            column
            for column in ("stage_order", "gdd_from", "gdd_to")
            if any(_int(row[column]) is None for row in rows)
        ]
        if bad:
            problems.append(f"{name}: 정수가 아닌 값이 있다 {bad}")
            continue

        rows.sort(key=lambda r: int(r["stage_order"]))

        orders = [int(row["stage_order"]) for row in rows]
        if orders != list(range(1, len(orders) + 1)):
            problems.append(f"{name}: stage_order 가 1부터 연속이 아니다 {orders}")

        if int(rows[0]["gdd_from"]) != 0:
            problems.append(f"{name}: 첫 단계 gdd_from {rows[0]['gdd_from']}, 0 이어야 한다")

        # 길이가 하나 차이 나는 게 정상이라 strict 를 켜지 않는다
        for prev, cur in zip(rows, rows[1:], strict=False):
            if int(prev["gdd_to"]) != int(cur["gdd_from"]):
                problems.append(
                    f"{name} {cur['stage_order']}단계: gdd_from {cur['gdd_from']}, "
                    f"앞 단계 gdd_to {prev['gdd_to']}"
                )

        target = _int(variant["gdd_target"])
        if target is None:
            problems.append(f"{name}: gdd_target 이 정수가 아니다 {variant['gdd_target']}")
        elif int(rows[-1]["gdd_to"]) != target:
            problems.append(f"{name}: 마지막 gdd_to {rows[-1]['gdd_to']}, gdd_target {target}")

    return problems


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

    rows = [
        {
            "crop_id": crop_id[r["crop_name"]],
            "hazard": r["hazard"],
            "rule_kind": r["rule_kind"],
            # read_csv 가 빈 칸을 None 으로 주는데, UNIQUE 가 NULL 끼리를 서로 다르게
            # 보아 같은 규칙이 몇 번이고 다시 들어간다. 빈 문자열로 맞춘다
            "stage_name": r["stage_name"] or "",
            "metric": r["metric"],
            "op": r["op"],
            "threshold_c": r["threshold_c"],
            "duration_days": r["duration_days"],
            "severity": r["severity"],
        }
        for r in data["crop_disaster_rules"]
    ]
    done["crop_disaster_rules"] = upsert(
        db, CropDisasterRule, rows, ["crop_id", "rule_kind", "stage_name", "severity"]
    )

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
    data = read_all(MASTER_DIR, TABLES)

    if "--check" in sys.argv:
        count_rows(data, TABLES)
        # 한 번에 모아 찍고 한 번만 멈춘다. 종류별로 고치고 다시 돌리지 않게
        check.report(
            [
                *check.duplicates(data, UNIQUE),
                *check.refs(data, REFS),
                *stage_problems(data),
            ]
        )
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
