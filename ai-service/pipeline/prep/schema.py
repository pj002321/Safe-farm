"""스키마 생성 공용 함수. 어느 테이블인지는 알지 않는다.

무엇을 만들지 고르는 일과 실행 여부는 호출하는 쪽이 정한다.
DDL 은 Postgres 문법으로만 뽑는다 — 이 프로젝트는 Postgres 전용이다.

own_tables로 ORM에 있는 테이블 -> ddl()로  create table 쿼리 만들기
"""

from collections.abc import Iterable, Sequence

from sqlalchemy import Engine, MetaData, Table, inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable


def own_tables(
    metadata: MetaData,
    skip_schemas: Iterable[str] = (),
    skip_tables: Iterable[str] = (),
) -> list[Table]:
    """
    # summary
    우리가 만들어도 되는 테이블만 의존 순서대로 고른다. skip_schemas 에 든
    스키마는 남이 소유한 것으로 보고 뺀다. 같은 스키마 안에서 일부만 빼야 하면
    skip_tables 를 쓴다 — 정본이 다른 곳(마이그레이션)에 있는 테이블이 그렇다.

    # params
    metadata: 대상 MetaData<br>
    skip_schemas: 건드리지 않을 스키마 이름 — Supabase 가 만드는 "auth" 같은 것<br>
    skip_tables: 건드리지 않을 테이블 이름. 스키마 없이 이름만 비교함<br>

    # returns
    의존 순서대로 정렬된 테이블. 부모가 자식보다 앞에 온다 — 그대로 CREATE 해도 된다

    # examples
        own_tables(FarmBase.metadata, ["auth"])
        -> [Table('crops'...), Table('grids'...), ...]   # auth.users 는 빠진다
        own_tables(FarmBase.metadata, ["auth"], ["profiles"])   # profiles 도 뺀다
    """
    skip = set(skip_schemas)
    skip_names = set(skip_tables)
    return [
        table
        for table in metadata.sorted_tables
        if table.schema not in skip and table.name not in skip_names
    ]


def ddl(tables: Iterable[Table]) -> str:
    """
    # summary
    CREATE TABLE 문을 문자열로 만든다. DB 에 붙지 않고 실행도 하지 않는다 —
    눈으로 보거나 .sql 로 넘길 때 쓴다.

    # params
    tables: own_tables 가 돌려준 것처럼 이미 순서가 잡힌 테이블들<br>

    # returns
    CREATE TABLE 문을 빈 줄 하나로 이어 붙인 문자열. 각 문장은 ';' 로 끝난다.
    tables 가 비면 빈 문자열

    # examples
        print(ddl(tables))
        -> CREATE TABLE IF NOT EXISTS crops ( ... );
    """
    dialect = postgresql.dialect()
    return "\n\n".join(
        str(CreateTable(table, if_not_exists=True).compile(dialect=dialect)).strip() + ";"
        for table in tables
    )


def create(
    engine: Engine,
    metadata: MetaData,
    tables: Sequence[Table],
    drop_existing: bool = False,
) -> list[str]:
    """
    # summary
    없는 테이블만 만든다. 새로 만들어진 이름을 돌려준다.
    이미 있는 테이블의 컬럼이 ORM 과 달라도 고치지 않는다 — 그건 마이그레이션 일이다.

    # params
    engine: 만들 대상 DB<br>
    metadata: tables 가 속한 MetaData<br>
    tables: 만들 테이블. 부모가 앞에 와야 한다<br>
    drop_existing: True 면 같은 이름의 기존 테이블을 먼저 DROP 한다. 들어 있던
        데이터도 같이 없어진다. 컬럼을 바꾼 뒤 개발 DB 를 맞출 때만 쓴다<br>

    # returns
    이번에 새로 만들어진 테이블 이름, 정렬된 상태. 이미 있던 것은 빠지므로
    두 번째 실행부터는 빈 리스트다

    # examples
        create(engine, FarmBase.metadata, tables)  -> ['crops', 'grids', ...]
    """
    if drop_existing:
        # 자식부터 지운다. 지운 뒤에 세야 다시 만든 것도 "새로"로 잡힌다
        metadata.drop_all(engine, tables=list(tables), checkfirst=True)
    before = set(inspect(engine).get_table_names())
    metadata.create_all(engine, tables=list(tables), checkfirst=True)
    after = set(inspect(engine).get_table_names())
    return sorted(after - before)
