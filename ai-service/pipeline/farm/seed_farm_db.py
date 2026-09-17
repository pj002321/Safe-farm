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

from app.core.config import DATA_DIR
from app.core.db import get_engine, new_session
from app.models.farm import WeatherObsDaily
from pipeline.prep import check
from pipeline.prep.seeding import count_rows, read_all, report, require_tables
from pipeline.prep.table import upsert

DUMMY_DIR = DATA_DIR / "dummy"    # 런타임 대체용 가짜 (weather_*)
MASTER_DIR = DATA_DIR / "master"  # 실측 마스터. 넣지 않고 자연키 검사에만 읽는다
MASTER_HINT = "py -3.12 -m pipeline.farm.master_seed_farm_db"

# 넣는 순서. 부모가 먼저다
TABLES = [
    "weather_obs_daily",
]

# 넣지 않는다. 자연키가 맞는지 보려고 읽기만 한다
MASTER_TABLES = ["stations"]

REFS = [
    ("weather_obs_daily", ["station_code"], "stations", ["station_code"]),
]


def load(db, data: dict[str, list[dict]]) -> dict[str, int]:
    """
    # summary
    TABLES 순서대로 upsert 한다.

    # params
    db: 세션<br>
    data: read_all 결과<br>

    # returns
    테이블 이름 -> 반영된 행 수. TABLES 의 키가 전부 들어 있다.
    upsert 라 "반영" 은 새로 넣은 것과 갱신한 것을 합친 수다

    # examples
        load(db, data)  -> {'weather_obs_daily': 17}
    """
    done: dict[str, int] = {}

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
    data = read_all(DUMMY_DIR, TABLES) | read_all(MASTER_DIR, MASTER_TABLES)


    if "--check" in sys.argv:
        count_rows(data, TABLES)
        check.report(check.refs(data, REFS))
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
