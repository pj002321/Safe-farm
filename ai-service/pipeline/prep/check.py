"""CSV 내용 검사. 문제를 문자열로 모아 돌려주기만 한다.

찍고 멈추는 것은 report() 한 곳뿐이다. 검사마다 멈추면 한 번에 한 종류씩만 보여서,
고치고 다시 돌리기를 문제 종류만큼 반복하게 된다.

자연키는 어느 테이블이든 "컬럼 이름 몇 개" 라 규칙을 선언 목록으로 받는다.
검사를 늘리는 일이 목록에 한 줄 넣는 일이 되게 하려는 것이다.
"""

from collections.abc import Callable, Sequence
from typing import Any

from pipeline.prep.table import duplicate_keys, missing_refs

# (테이블, 겹치면 안 되는 컬럼들)
Unique = tuple[str, Sequence[str]]

# (자식 테이블, 자식 컬럼들, 부모 테이블, 부모 컬럼들). 자식 값이 부모에 있어야 한다
Ref = tuple[str, Sequence[str], str, Sequence[str]]


def _key_of(columns: Sequence[str]) -> Callable[[dict], Any]:
    """컬럼이 하나면 값 그대로, 둘 이상이면 튜플. key_dict 와 같은 규칙이다."""
    if len(columns) == 1:
        column = columns[0]
        return lambda row: row[column]
    return lambda row: tuple(row[name] for name in columns)


def _absent_columns(rows: Sequence[dict], columns: Sequence[str]) -> list[str]:
    """CSV 헤더에 없는 컬럼. 규칙의 오타를 KeyError 대신 문제로 알리려고 먼저 본다."""
    if not rows:
        return []  # 행이 없으면 헤더를 알 수 없다. 빈 CSV 는 여기서 따지지 않는다
    have = rows[0].keys()
    return [name for name in columns if name not in have]


def duplicates(data: dict[str, list[dict]], rules: Sequence[Unique]) -> list[str]:
    """
    # summary
    CSV 안에서 자연키가 겹치는지 본다. DB 의 UNIQUE·PK 와 같은 조합을 준다.

    적재가 행을 한 문장에 몰아 넣어서 DB 제약만 믿을 수 없다. DO UPDATE 로 나가는
    테이블은 어느 행이 겹쳤는지 모른 채 멈추고, 갱신할 컬럼이 없어 DO NOTHING 으로
    나가는 테이블(grids)은 그냥 지나간다.

    # params
    data: read_all 결과<br>
    rules: (테이블, 컬럼들) 목록<br>

    # returns
    문제 설명 한 줄씩, rules 순서대로. 이상이 없으면 빈 리스트

    # examples
        duplicates(data, [("crops", ["name"])])
        -> ['crops: name 겹침 [\'상추\']']
    """
    problems = []
    for table, columns in rules:
        rows = data[table]
        absent = _absent_columns(rows, columns)
        if absent:
            problems.append(f"{table}: 규칙이 가리키는 컬럼이 CSV 에 없다 {absent}")
            continue

        dup = duplicate_keys(rows, _key_of(columns))
        if dup:
            keys = sorted({str(key) for key in dup})
            problems.append(f"{table}: {'+'.join(columns)} 겹침 {keys}")
    return problems


def refs(data: dict[str, list[dict]], rules: Sequence[Ref]) -> list[str]:
    """
    # summary
    자식 CSV 가 가리키는 값이 부모 CSV 에 있는지 본다. DB 에 붙지 않는다.
    identity 로 발급되는 id 는 적재 시점에야 정해지므로 자연키로 검사한다.

    # params
    data: read_all 결과. 부모 테이블도 들어 있어야 한다<br>
    rules: (자식, 자식 컬럼들, 부모, 부모 컬럼들) 목록<br>

    # returns
    문제 설명 한 줄씩, rules 순서대로. 이상이 없으면 빈 리스트

    # examples
        refs(data, [("crop_variants", ["crop_name"], "crops", ["name"])])
        -> ['crop_variants -> crops: 없는 대상 [\'토마토\']']
    """
    problems = []
    for child, child_columns, parent, parent_columns in rules:
        absent = [
            *(f"{child}.{name}" for name in _absent_columns(data[child], child_columns)),
            *(f"{parent}.{name}" for name in _absent_columns(data[parent], parent_columns)),
        ]
        if absent:
            problems.append(f"{child} -> {parent}: 규칙이 가리키는 컬럼이 CSV 에 없다 {absent}")
            continue

        known = {_key_of(parent_columns)(row) for row in data[parent]}
        bad = missing_refs(data[child], _key_of(child_columns), known)
        if bad:
            keys = sorted({str(key) for key in bad})
            problems.append(f"{child} -> {parent}: 없는 대상 {keys}")
    return problems


def report(problems: Sequence[str]) -> None:
    """
    # summary
    모아둔 문제를 전부 찍고, 하나라도 있으면 SystemExit(1) 로 멈춘다.
    멈추는 자리가 여기 하나뿐이라 무엇이 잘못됐는지 한 화면에서 다 보인다.

    # params
    problems: 문제 설명 목록. 비어 있으면 통과다<br>

    # examples
        report([*duplicates(data, UNIQUE), *refs(data, REFS)])
        -> CSV 검사 통과
    """
    if problems:
        print(f"\nCSV 검사 실패 {len(problems)}건")
        for problem in problems:
            print(f"  - {problem}")
        raise SystemExit(1)
    print("\nCSV 검사 통과")
