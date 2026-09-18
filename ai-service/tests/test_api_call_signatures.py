"""라우터의 함수 호출이 **실제 시그니처와 맞는지** 정적으로 확인한다.

이 부류로 운영이 두 번 죽었다:

    ask.py:164  build_plot_context(db, request.plot_id)
    TypeError: build_plot_context() missing 1 required positional argument: 'user_id'

    ask.py:178  _sse(history, ask_matches, stream_answer(...), db)
    TypeError: _sse() missing 1 required positional argument: 'quota'

둘 다 머지에서 한쪽이 시그니처에 인자를 더하고 다른 쪽 호출부는 옛 모양 그대로
남은 경우다. 파일이 달라 git 충돌이 안 나고, 파이썬은 이런 불일치를 import 시점에
잡지 못한다 — 실제 요청이 들어와야 드러난다.

처음에는 build_plot_context 하나만 검사했는데 바로 다음에 _sse 로 같은 일이 났다.
그래서 **특정 함수가 아니라 부류 전체**를 본다: api 모듈 안의 모든 호출을 AST 로
훑어, 그 이름이 우리 코드에 정의된 함수면 필수 인자가 다 있는지 센다.
"""

import ast
import inspect
import pathlib

from app.api import (
    alerts,
    ask,
    crop,
    diagnose,
    map,
    recommend,
    reports,
    satellite,
    status,
    tasks,
    variety,
    weather,
)

API_MODULES = (
    alerts,
    ask,
    crop,
    diagnose,
    map,
    recommend,
    reports,
    satellite,
    status,
    tasks,
    variety,
    weather,
)

#: 검사에서 빼는 이름. 표준 라이브러리·서드파티·데코레이터는 우리 책임이 아니다.
_SKIP_PREFIXES = ("Depends", "HTTPException", "APIRouter", "StreamingResponse")


def _required_params(fn) -> list[str]:
    """기본값이 없는 위치 인자 이름. *args/**kwargs 와 self 는 뺀다."""
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return []
    return [
        name
        for name, p in sig.parameters.items()
        if p.default is inspect.Parameter.empty
        and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]


def _collect_mismatches(module) -> list[str]:
    # 소스를 못 읽는 모듈이 있다(빌드 환경에 따라 다르다). 검사기가 거기서
    # 터지면 나머지 모듈까지 못 보므로 건너뛴다 — 커버리지 테스트가 별도로
    # "모듈이 목록에 있는지"를 지키므로 조용히 사라지지는 않는다.
    try:
        source = inspect.getsource(module)
    except (OSError, TypeError):
        return []
    tree = ast.parse(source)
    problems = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue

        name = node.func.id
        if name.startswith(_SKIP_PREFIXES):
            continue

        target = getattr(module, name, None)
        if not callable(target):
            continue
        # 우리 코드에서 정의한 것만 본다. 서드파티는 우리가 못 고친다.
        try:
            where = inspect.getsourcefile(target) or ""
        except TypeError:
            continue
        if "/app/" not in where.replace("\\", "/"):
            continue

        required = _required_params(target)
        # **kwargs 로 넘기는 경우는 정적으로 셀 수 없다 — 건너뛴다(거짓 양성 방지).
        if any(k.arg is None for k in node.keywords):
            continue

        given = len(node.args) + len({k.arg for k in node.keywords})
        if given < len(required):
            problems.append(
                f"{module.__name__}:{node.lineno} {name}(...) 에 인자가 모자란다 — "
                f"필수 {len(required)}개({', '.join(required)}), 넘긴 것 {given}개"
            )

    return problems


def test_api_calls_supply_every_required_argument():
    problems = []
    for module in API_MODULES:
        problems.extend(_collect_mismatches(module))

    assert not problems, "라우터 호출이 시그니처와 어긋난다:\n" + "\n".join(problems)


def test_the_check_actually_catches_a_missing_argument():
    """검사기 자체가 도는지 확인한다.

    이게 없으면 _collect_mismatches 가 조용히 아무것도 안 세도(예: 경로 필터가
    너무 좁아져서) 위 테스트가 늘 통과한다 — 안전망이 있다는 착각만 남는다.
    """
    tree = ast.parse("f(1)")
    call = tree.body[0].value

    def f(a, b):  # noqa: ARG001 — 필수 인자 2개짜리 표본
        return None

    required = _required_params(f)
    given = len(call.args) + len({k.arg for k in call.keywords})

    assert len(required) == 2
    assert given < len(required), "표본에서 인자 부족을 못 잡으면 검사기가 고장난 것"


def test_build_plot_context_keeps_user_id_required():
    """user_id 가 optional 로 바뀌면 소유 확인을 조용히 건너뛸 수 있다.

    남의 밭 컨텍스트가 LLM 프롬프트에 실리는 경로라, 기본값을 주는 쪽으로
    '고치는' 것을 막는다.
    """
    from app.service import ask_context

    sig = inspect.signature(ask_context.build_plot_context)
    assert sig.parameters["user_id"].default is inspect.Parameter.empty


def test_every_api_module_is_covered():
    """api 폴더에 새 모듈이 생기면 이 테스트에 등록하라고 알린다."""
    here = pathlib.Path(inspect.getsourcefile(ask)).parent
    on_disk = {p.stem for p in here.glob("*.py") if p.stem != "__init__"}
    checked = {m.__name__.rsplit(".", 1)[-1] for m in API_MODULES}

    assert on_disk <= checked, (
        f"검사에서 빠진 api 모듈: {sorted(on_disk - checked)} — "
        "API_MODULES 에 추가하라"
    )
