"""CSV 시드 스크립트의 공통 뼈대. 어느 테이블을 다루는지는 알지 않는다.

무엇을 어떤 순서로 넣을지, 자연키가 무엇인지는 호출하는 쪽이 정한다.
여기 있는 것은 시드 스크립트마다 똑같이 반복되던 입출력과 사전 검사뿐이다.
"""

from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from sqlalchemy import Engine

from pipeline.prep.table import missing_refs, missing_tables, read_csv

# (설명, 검사할 행들, 행에서 키를 꺼내는 함수, 있다고 아는 키 집합)
Ref = tuple[str, Sequence[dict], Callable[[dict], Any], set]


def read_all(directory: Path, tables: Sequence[str]) -> dict[str, list[dict]]:
    """
    # summary
    <테이블 이름>.csv 를 전부 읽어 {테이블 이름: 행 목록} 으로 돌려준다.
    파일 이름이 곧 테이블 이름이라는 약속에 기댄다.

    # params
    directory: CSV 가 모여 있는 디렉터리<br>
    tables: 읽을 테이블 이름들<br>

    # returns
    테이블 이름 -> 행 목록. tables 의 이름이 전부 키로 들어 있다.
    파일이 없으면 FileNotFoundError 라 빈 값은 나오지 않는다

    # examples
        read_all(Path("data/dummy"), ["crops", "grids"])
        -> {'crops': [...], 'grids': [...]}
    """
    return {name: read_csv(directory / f"{name}.csv") for name in tables}


def count_rows(data: dict[str, list[dict]], tables: Sequence[str]) -> None:
    """
    # summary
    테이블별 CSV 행 수를 찍는다. 넣기 전에 무엇이 얼마나 들어갈지 보려고 쓴다.

    # params
    data: read_all 결과<br>
    tables: 찍을 순서<br>

    # examples
        count_rows(data, ["crops"])
        ->   crops                8 행
    """
    for name in tables:
        print(f"  {name:18s} {len(data[name]):3d} 행")


def check_refs(refs: Sequence[Ref]) -> None:
    """
    # summary
    CSV 끼리 자연키가 맞는지 본다. DB 에 붙지 않는다.
    어긋난 것이 있으면 전부 찍고 SystemExit(1) 로 멈춘다 — 첫 실패에서 서지 않는다.

    # params
    refs: Ref 목록. 무엇이 무엇을 가리키는지는 호출하는 쪽이 안다<br>

    # examples
        check_refs([("crop_variants -> 작물", rows, lambda r: r["crop_name"], names)])
        -> 자연키 전부 해석됨
    """
    broken = False
    for label, rows, key_of, known in refs:
        bad = missing_refs(rows, key_of, known)
        if bad:
            broken = True
            print(f"\n{label}: 없는 대상 {sorted(set(map(str, bad)))}")
    if broken:
        raise SystemExit(1)
    print("\n자연키 전부 해석됨")


def require_tables(engine: Engine, tables: Sequence[str], hint: str) -> None:
    """
    # summary
    넣기 전에 테이블이 다 있는지 본다. 없으면 이름과 다음에 할 일을 찍고 멈춘다.
    없는 채로 시작하면 한참 뒤 엉뚱한 자리에서 에러가 난다.

    # params
    engine: 검사할 DB<br>
    tables: 있어야 하는 테이블 이름들<br>
    hint: 없을 때 안내할 명령 — 무엇을 먼저 돌려야 하는지<br>

    # examples
        require_tables(engine, TABLES, "py -3.12 -m pipeline.farm.init_farm_db")
    """
    absent = missing_tables(engine, tables)
    if absent:
        print("DB 에 테이블이 없습니다:", ", ".join(absent))
        raise SystemExit(f"먼저 실행하세요: {hint}")


def report(data: dict[str, list[dict]], tables: Sequence[str], done: dict[str, int]) -> None:
    """
    # summary
    테이블별로 반영된 행 수와 CSV 행 수를 나란히 찍는다.
    upsert 라 "반영" 은 새로 넣은 것과 갱신한 것을 합친 수다.

    # params
    data: read_all 결과<br>
    tables: 찍을 순서<br>
    done: 테이블 이름 -> 반영된 행 수<br>

    # examples
        report(data, ["crops"], {"crops": 8})
        ->   crops              반영   8 / CSV   8
    """
    for name in tables:
        print(f"  {name:18s} 반영 {done[name]:3d} / CSV {len(data[name]):3d}")
