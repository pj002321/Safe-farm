"""data/dummy/*.csv -> farm 런타임 테이블. 개발 DB 전용 임시 데이터다.

여기 있는 것은 원래 운영 중에 기상청 API 가 채우는 데이터다. 그것이 붙기 전까지만
더미로 채워 쓴다.

회원·동의·텃밭은 다루지 않는다. 유저가 넣는 데이터라 쓰기는 Next.js 몫이고 정본은
supabase/migrations 다. ai-service 는 그 값을 요청으로 받지 DB 에서 읽지 않는다.

마스터를 참조하므로 master_seed_farm_db.py 를 먼저 돌려야 한다.
grid_id 는 CSV 에 없다. 이미 들어간 마스터에서 조회해 채운다.

실행: py -3.12 -m pipeline.farm.seed_farm_db
      py -3.12 -m pipeline.farm.seed_farm_db --check   DB 없이 CSV 만 검사
"""

import sys

from sqlalchemy import func, select

from app.core.config import DATA_DIR
from app.core.db import get_engine, new_session
from app.models.farm import Grid, WeatherForecast, WeatherObsDaily
from pipeline.prep.seeding import Ref, check_refs, count_rows, read_all, report, require_tables
from pipeline.prep.table import key_dict, upsert

DUMMY_DIR = DATA_DIR / "dummy"
MASTER_HINT = "py -3.12 -m pipeline.farm.master_seed_farm_db"

# 넣는 순서. 부모가 먼저다
TABLES = [
    "weather_forecast",
    "weather_obs_daily",
]

# 넣지 않는다. 자연키가 맞는지 보려고 읽기만 한다
MASTER_TABLES = ["grids", "stations"]


def refs(data: dict[str, list[dict]]) -> list[Ref]:
    """
    # summary
    런타임 테이블이 마스터와 자기들끼리 무엇을 가리키는지 모은다.

    # params
    data: read_all 결과. MASTER_TABLES 도 들어 있어야 한다<br>

    # returns
    Ref 목록 4개. 검사 순서대로 들어 있고, 가리키는 대상이 없는 테이블은 빠진다

    # examples
        check_refs(refs(data))  -> 자연키 전부 해석됨
    """
    grids = {(r["nx"], r["ny"]) for r in data["grids"]}
    stations = {r["station_code"] for r in data["stations"]}

    return [
        (
            "weather_forecast -> 격자",
            data["weather_forecast"],
            lambda r: (r["nx"], r["ny"]),
            grids,
        ),
        (
            "weather_obs_daily -> 관측소",
            data["weather_obs_daily"],
            lambda r: r["station_code"],
            stations,
        ),
    ]


def load(db, data: dict[str, list[dict]]) -> dict[str, int]:
    """
    # summary
    TABLES 순서대로 upsert 한다. grid_id 는 이미 적재된 마스터에서 조회해 채운다.
    마스터가 비어 있으면 무엇을 먼저 돌려야 하는지 알리고 멈춘다.

    # params
    db: 세션<br>
    data: read_all 결과<br>

    # returns
    테이블 이름 -> 반영된 행 수. TABLES 의 키가 전부 들어 있다.
    upsert 라 "반영" 은 새로 넣은 것과 갱신한 것을 합친 수다

    # examples
        load(db, data)  -> {'weather_forecast': 12, 'weather_obs_daily': 17}
    """
    done: dict[str, int] = {}

    grid_id = key_dict(db, select(Grid.nx, Grid.ny, Grid.grid_id), cast=str)
    if not grid_id:
        raise SystemExit(f"마스터가 비어 있습니다. 먼저 실행하세요: {MASTER_HINT}")

    rows = [
        {
            "grid_id": grid_id[(r["nx"], r["ny"])],
            "fcst_date": r["fcst_date"],
            "temp_max": r["temp_max"],
            "temp_min": r["temp_min"],
            "rainfall_mm": r["rainfall_mm"],
        }
        for r in data["weather_forecast"]
    ]
    # 예보를 덮어쓰면 수집 시각도 지금으로 바꾼다
    done["weather_forecast"] = upsert(
        db,
        WeatherForecast,
        rows,
        ["grid_id", "fcst_date"],
        override_update={"fetched_at": func.now()},
    )
    done["weather_obs_daily"] = upsert(
        db, WeatherObsDaily, data["weather_obs_daily"], ["station_code", "obs_date"]
    )

    db.commit()
    return done


def main() -> None:
    """
    # summary
    런타임 테이블의 더미 CSV 를 읽어 적재한다. --check 면 DB 를 열지 않고 검사만 한다.
    마스터 CSV 는 자연키 검사에만 쓰고 넣지 않는다.

    # params
    없다. 옵션은 argv 에서 읽는다 — --check<br>

    # examples
        py -3.12 -m pipeline.farm.seed_farm_db --check
        py -3.12 -m pipeline.farm.seed_farm_db
    """
    data = read_all(DUMMY_DIR, TABLES + MASTER_TABLES)

    if "--check" in sys.argv:
        count_rows(data, TABLES)
        check_refs(refs(data))
        return

    require_tables(get_engine(), TABLES + MASTER_TABLES, MASTER_HINT)

    db = new_session()
    try:
        done = load(db, data)
    finally:
        db.close()

    report(data, TABLES, done)


if __name__ == "__main__":
    main()
