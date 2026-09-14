"""ORM 정의대로 farm 테이블을 만든다. 개발 DB 전용.

여기는 farm 스키마만 안다. 고르기·DDL·생성 같은 공용 동작은
pipeline.prep.schema 에 있다.

그냥 돌리면 몇 번을 돌려도 안전하고 지우는 것은 없다. 다만 이미 있는 테이블의 컬럼이
ORM 과 어긋나도 고치지 않는다 — 그때 쓰라고 --drop 이 있다.

실행: py -3.12 -m pipeline.farm.init_farm_db
      py -3.12 -m pipeline.farm.init_farm_db --sql    실행하지 않고 CREATE 문만 출력
      py -3.12 -m pipeline.farm.init_farm_db --drop   먼저 지우고 다시 만든다
"""

import sys

from app.core.db import get_engine
from app.models.farm import FarmBase
from pipeline.prep.schema import create, ddl, own_tables

# Supabase 가 소유한다. 지금은 가리키는 FK 도 없지만, 남의 스키마를 만들지 않는다는
# 선은 그대로 둔다 — auth 관련 정의가 늘어도 여기서 만들어지지 않게
SKIP_SCHEMAS = ["auth"]


def main() -> None:
    """
    # summary
    FarmBase 에 등록된 테이블을 만든다. --sql 이면 DB 에 붙지 않고 문장만 찍는다.
    --drop 이면 만들기 전에 같은 이름의 테이블을 지운다. 들어 있던 데이터도 같이 없어진다.

    # params
    없다. 옵션은 argv 에서 읽는다 — --sql, --drop

    # examples
        py -3.12 -m pipeline.farm.init_farm_db --sql
        py -3.12 -m pipeline.farm.init_farm_db --drop
    """
    tables = own_tables(FarmBase.metadata, SKIP_SCHEMAS)

    if "--sql" in sys.argv:
        print(ddl(tables))
        return

    drop = "--drop" in sys.argv
    if drop:
        # 무엇이 날아가는지는 지우기 전에 찍는다. 끝난 뒤 알려주면 늦다
        print("지우고 다시 만듭니다:", ", ".join(table.name for table in tables))

    made = create(get_engine(), FarmBase.metadata, tables, drop_existing=drop)
    print("새로 만든 테이블:", ", ".join(made) if made else "없음")
    print("확인한 테이블 :", ", ".join(table.name for table in tables))


if __name__ == "__main__":
    main()
