"""DB 쿼리가 `app/repo/` 밖으로 새지 않는지 지킨다.

2026-09-19 에 `api/` · `service/` 에 흩어져 있던 쿼리를 repo 층으로 모았다.
모으는 것 자체보다 **모여 있는 상태를 유지하는 것**이 어렵다 — 새 기능을 붙일 때
바로 옆에 `db.query(...)` 를 한 줄 적는 게 언제나 제일 빠르기 때문이다.

그렇게 새면 이런 일이 난다. 실제로 겪은 것들이다:

  · 같은 "내 밭" 조회가 두 파일에 글자까지 같은 두 벌로 있었다.
  · `deleted_at is null` 을 손으로 적는 자리가 다섯 군데였고, 한 곳이 빠져서
    지운 밭에 할 일 카드가 계속 쌓였다.
  · 대표 재배 건 조회에 `deleted_at` 이 없어서, 같은 밭을 `/ask` 와 리포트가
    서로 다른 작물로 말했다.

셋 다 예외도 실패도 아니라 **조용히 틀린 값**이라 늦게 발견됐다. 그래서 사람이
리뷰에서 잡는 대신 여기서 기계로 막는다.
"""

import ast
import pathlib

import app

#: 세션에서 질의를 시작하는 메서드들. 이 이름이 `db.<이름>(` 꼴로 불리면 쿼리다.
_QUERY_METHODS = {"query", "execute", "scalar", "scalars", "get", "add", "delete", "merge"}

#: 세션이 담기는 변수 이름. 프로젝트 전체가 `db` 로 통일돼 있다.
_SESSION_NAMES = {"db", "session"}

#: 쿼리를 직접 써도 되는 곳.
#:
#: `repo/`      — 여기가 제자리다.
#: `knowledge/` — pgvector 연산자(`<=>`)와 `set local hnsw.iterative_scan` 같은
#:                세션 상태를 쓴다. ORM 표현으로 옮기면 쿼리가 오히려 흐려지고,
#:                무엇보다 이 둘은 **같은 트랜잭션 안에서만** 의미가 있어
#:                호출부와 떼어 놓으면 조용히 효과가 사라진다.
#: `core/db.py` — 세션을 만드는 곳이다.
_ALLOWED = ("repo/", "knowledge/", "core/db.py")


def _app_dir() -> pathlib.Path:
    return pathlib.Path(app.__file__).parent


def _offenders(path: pathlib.Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        target = node.func.value
        if not isinstance(target, ast.Name) or target.id not in _SESSION_NAMES:
            continue
        if node.func.attr not in _QUERY_METHODS:
            continue
        out.append(f"{path.name}:{node.lineno} {target.id}.{node.func.attr}(...)")
    return out


def test_no_direct_queries_outside_repo():
    app_dir = _app_dir()
    problems = []

    for path in app_dir.rglob("*.py"):
        rel = path.relative_to(app_dir).as_posix()
        if any(rel.startswith(a) or rel == a for a in _ALLOWED):
            continue
        problems.extend(f"{rel} :: {p.split(':', 1)[1]}" for p in _offenders(path))

    assert not problems, (
        "repo 밖에서 DB 를 직접 부른다 — app/repo/ 에 함수를 만들어 거기서 부르라:\n"
        + "\n".join(problems)
    )


def test_the_check_actually_catches_a_direct_query(tmp_path):
    """검사기 자체가 도는지 확인한다.

    이게 없으면 `_offenders` 가 조용히 아무것도 안 세도(예: 메서드 목록이 낡아서)
    위 테스트가 늘 통과한다 — 안전망이 있다는 착각만 남는다.
    """
    sample = tmp_path / "sample.py"
    sample.write_text("def f(db):\n    return db.query(Thing).all()\n", encoding="utf-8")

    assert _offenders(sample), "표본에서 직접 쿼리를 못 잡으면 검사기가 고장난 것"


def test_every_repo_module_only_reads_its_own_table():
    """repo 모듈이 다른 repo 를 부르지 않는지 본다.

    repo 끼리 엮이기 시작하면 "이 함수가 쿼리를 몇 번 날리나"를 호출부에서 셀 수
    없게 된다. 두 표를 함께 봐야 하면 조인을 쓰거나, 각각 받아 service 에서 합친다.

    예외는 `crop.usable_crop_of_variant` 하나다 — 같은 파일 안의 `variant_by_id`
    를 부른다. 같은 모듈이라 이 규칙에 걸리지 않는다.
    """
    repo_dir = _app_dir() / "repo"
    problems = []

    for path in repo_dir.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or not node.module:
                continue
            if node.module.startswith("app.repo") and node.module != f"app.repo.{path.stem}":
                problems.append(f"{path.name} -> {node.module}")

    assert not problems, "repo 모듈끼리 import 한다:\n" + "\n".join(problems)
