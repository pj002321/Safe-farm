"""CSV 적재 공용 함수. 어느 테이블에 쓸지 모르게, 스키마를 알지 않는다.

테이블 순서·컬럼 매핑·자연키 규칙은 호출하는 쪽이 정한다.
"""

import csv
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, Select, inspect
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session


def read_csv(path: Path) -> list[dict]:
    """
    # summary
    CSV 를 dict 목록으로 읽는다. 빈 칸은 None 으로 바꾼다 —
    CSV 는 NULL 과 빈 문자열을 구분하지 못한다.

    # params
    path: 읽을 파일. 첫 줄이 헤더여야 한다.

    # examples
        read_csv(Path("data/dummy/crops.csv"))
        -> [{'name': '상추', 'base_temp': '4.0', 'difficulty': None}, ...]
    """
    with path.open(encoding="utf-8", newline="") as f:
        return [
            {k: ((v or "").strip() or None) for k, v in row.items()}
            for row in csv.DictReader(f)
        ]


def upsert(
    db: Session,
    model,
    rows: Sequence[dict],
    conflict: Sequence[str],
    override_update: dict | None = None,
) -> int:
    """
    # summary
    없으면 넣고 있으면 갱신한다. 영향받은 행 수를 돌려준다.
    갱신 대상은 rows 의 컬럼에서 conflict 를 뺀 나머지다. 뺄 것이 없으면
    (자연키가 컬럼 전부인 테이블) 갱신할 게 없으므로 건너뛴다.

    # params
    db: 세션
    model: 넣을 테이블의 ORM 클래스
    rows: 컬럼 이름이 키인 dict 목록. 전부 같은 컬럼이어야 한다
    conflict: UNIQUE 제약이나 PK 를 이루는 컬럼 이름. 이게 있어야
        같은 CSV 를 두 번 돌려도 결과가 같다
    override_update: CSV 에 없는 값을 덮어쓸 때 쓴다 — fetched_at=func.now() 같은 것

    # examples
        upsert(db, Crop, [{"name": "상추", "base_temp": 4.0}], ["name"])
        -> 1   # 이름이 겹치면 base_temp 만 새 값으로 바뀐다
    """
    if not rows:
        return 0
    rows = list(rows)
    stmt = insert(model).values(rows)
    keys = set(conflict)
    conflict_update: dict = {name: stmt.excluded[name] for name in rows[0] if name not in keys}
    # 업데이트 날짜 와 같은 컬럼은 csv에 없는 정보
    # -> 그래서 덮어쓰기 및 업데이트 파라미터로 넘기기
    if override_update:
        conflict_update.update(override_update)

    if conflict_update:  # 충돌 나면 덮어쓰기
        stmt = stmt.on_conflict_do_update(index_elements=list(conflict), set_=conflict_update)
    else:  # 안하기
        stmt = stmt.on_conflict_do_nothing(index_elements=list(conflict))
    return db.execute(stmt).rowcount


def key_dict(db: Session, stmt: Select, cast: Callable[[Any], Any] | None = None) -> dict:
    """
    # summary
    SELECT 결과를 "앞 컬럼들 -> 마지막 컬럼" 사전으로 만든다.
    identity 로 발급된 id 를 자연키로 찾을 때 쓴다. 컬럼이 셋 이상이면 키가 튜플이다.

    # params
    db: 세션
    stmt: 마지막 컬럼이 값, 나머지가 키인 SELECT
    cast: 키 각 조각에 거는 변환 — CSV 는 문자열인데 DB 는 정수로 주는 경우가 있다

    # examples
        key_dict(db, select(Crop.name, Crop.crop_id))              -> {'상추': 1}
        key_dict(db, select(Grid.nx, Grid.ny, Grid.grid_id), str)  -> {('60','127'): 1}
    """
    out = {}
    for row in db.execute(stmt).all():
        *key, value = row
        if cast is not None:
            key = [cast(part) for part in key]
        out[key[0] if len(key) == 1 else tuple(key)] = value
    return out


def missing_tables(engine: Engine, names: Iterable[str]) -> list[str]:
    """
    # summary
    아직 DB 에 없는 테이블 이름. 적재 전에 확인해 엉뚱한 에러 대신 알려주려고 쓴다.

    # params
    engine: 검사할 DB 엔진
    names: 있어야 하는 테이블 이름들

    # examples
        missing_tables(engine, ["crops", "plots"])  -> ['plots']
    """
    have = set(inspect(engine).get_table_names())
    return [name for name in names if name not in have]


def missing_refs(rows: Iterable[dict], key_of: Callable[[dict], Any], known: set) -> list:
    """
    # summary
    known 에 없는 값을 가리키는 행의 키만 모은다. DB 없이 CSV 끼리 검사할 때 쓴다.

    # params
    rows: 검사할 행들
    key_of: 행에서 참조 키를 꺼내는 함수. 어느 컬럼이 키인지가 테이블마다 달라
        호출하는 쪽에서 준다
    known: 존재한다고 확인된 키 집합

    # examples
        missing_refs(variants, lambda r: r["crop_name"], {"감자"})
        -> ['토마토']
    """
    bad = []
    for row in rows:
        key = key_of(row)
        if key not in known:
            bad.append(key)
    return bad
