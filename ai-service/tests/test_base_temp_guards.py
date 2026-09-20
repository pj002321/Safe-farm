"""`crop.base_temp` 를 쓰는 모든 경로에 가드가 있는지 지킨다.

crops.base_temp 는 nullable 이다(app/models/farm/crop_variant.py 주석, 2026-09-17).
그런데 GDD 는 기준온도 없이 정의되지 않아, 값이 비면 `float(None)` 이 터진다.
실제로 그 결손 하나가 **자정 배치 전체를 죽였다**.

문제는 쓰는 곳이 한 군데가 아니라는 것이다. 한 곳을 고쳐도 다음에 또 빠뜨리기
쉬워서, 여기서 소스를 훑어 "float(crop.base_temp) 를 하기 전에 걸러 내는가"를
기계적으로 확인한다. 새 경로가 생기면 이 테스트가 먼저 깨진다.

가드는 두 모양 중 하나면 된다:

  · 값을 직접 보는 것              — `crop.base_temp is None` (ask_context)
  · 조회 단계에서 걸러 내는 것     — `repo.crop.usable_crop_of_variant` (plot_growth)

후자는 2026-09-19 에 `_crop_for_cultivation` 이 repo 층으로 옮겨 간 자리다.
가드가 어디 있든 **값을 쓰는 줄보다 앞**이기만 하면 된다.
"""

import inspect
import re

from app.repo import crop as crop_repo
from app.service import ask_context, plot_growth

MODULES = (plot_growth, ask_context)

#: float(crop.base_temp) 로 값을 실제로 쓰는 줄.
_USE = re.compile(r"float\(\s*crop\.base_temp\s*\)")

#: 그 앞에서 None 을 걸러 내는 줄. 직접 보는 쪽과 조회로 거르는 쪽을 모두 인정한다.
_GUARD = re.compile(r"crop\.base_temp is None|usable_crop_of_variant")


def _code_lines(source: str) -> list[tuple[int, str]]:
    """주석을 뺀 (줄번호, 내용). 주석 안의 `float(crop.base_temp)` 를 코드로
    세면, 그 결함을 설명하는 주석을 달았다는 이유로 테스트가 깨진다."""
    out = []
    for i, line in enumerate(source.splitlines()):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        out.append((i, line))
    return out


def _first_line(source: str, pattern: re.Pattern) -> int | None:
    for i, line in _code_lines(source):
        if pattern.search(line):
            return i
    return None


def test_every_module_using_base_temp_has_a_guard():
    for module in MODULES:
        source = inspect.getsource(module)
        if _first_line(source, _USE) is None:
            continue
        assert _first_line(source, _GUARD) is not None, (
            f"{module.__name__} 이 float(crop.base_temp) 를 쓰면서 걸러 내지 않는다. "
            "base_temp 는 nullable 이라 이대로면 TypeError 로 터진다."
        )


def test_guards_come_before_the_use():
    """가드가 값을 쓰는 줄보다 **앞에** 있어야 의미가 있다.

    plot_growth 는 import 줄이 가드라 항상 앞이지만, 그 자명함에 기대지 않는다 —
    가드가 조회 안으로 다시 들어오는 형태로 바뀌어도 이 검사는 그대로 맞다.
    """
    for module in MODULES:
        source = inspect.getsource(module)
        use_at = _first_line(source, _USE)
        if use_at is None:
            continue
        guard_at = _first_line(source, _GUARD)
        assert guard_at is not None, f"{module.__name__} 에 base_temp 가드가 없다"
        assert guard_at < use_at, (
            f"{module.__name__} 의 가드가 사용 지점보다 뒤에 있다 — 막지 못한다"
        )


def test_the_shared_lookup_still_filters():
    """plot_growth 는 호출부가 셋이라 **공통 조회**에서 막는다.

    그 구조가 유지되는지 확인한다 — `repo.crop.usable_crop_of_variant` 가 걸러
    내고, 세 호출부는 `crop is None` 만 보면 되는 형태다. 이 함수에서 필터가
    빠지면 위의 두 테스트는 그대로 통과하면서(import 줄은 남아 있으므로) 운영만
    다시 죽는다.
    """
    source = inspect.getsource(crop_repo.usable_crop_of_variant)
    assert "base_temp is None" in source, (
        "usable_crop_of_variant 가 base_temp 를 더 이상 거르지 않는다 — "
        "이걸 믿고 가드를 뺀 호출부가 셋이다"
    )
