"""API 라우터가 서비스 함수를 **맞는 인자로** 부르는지 지킨다.

운영에서 /ask 가 통째로 500 이 된 적이 있다:

    ask.py:164  build_plot_context(db, request.plot_id)
    TypeError: build_plot_context() missing 1 required positional argument: 'user_id'

머지 때 한쪽은 시그니처에 user_id(소유 확인용)를 더하고 다른 쪽 호출부는 옛 모양
그대로였다. 파일이 달라 git 충돌이 안 났고, 파이썬은 이런 불일치를 import 시점에
잡지 못한다 — 실제 요청이 들어와야 드러난다. 그래서 여기서 기계적으로 확인한다.
"""

import inspect

from app.api import ask as ask_api
from app.service import ask_context


def test_build_plot_context_is_called_with_every_required_arg():
    sig = inspect.signature(ask_context.build_plot_context)
    required = [
        name
        for name, p in sig.parameters.items()
        if p.default is inspect.Parameter.empty
        and p.kind
        in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]

    source = inspect.getsource(ask_api)
    call_at = source.index("build_plot_context(db")
    call = source[call_at : call_at + 200]

    # db 는 첫 인자로 이미 확인했다. 나머지 필수 인자가 호출문에 등장하는지 본다.
    for name in required[1:]:
        assert name in call, (
            f"ask.py 가 build_plot_context 를 부르면서 '{name}' 를 안 넘긴다. "
            f"필수 인자: {required}"
        )


def test_user_id_is_required_so_ownership_cannot_be_skipped():
    """user_id 가 optional 로 바뀌면 소유 확인을 조용히 건너뛸 수 있다.

    남의 밭 컨텍스트가 LLM 프롬프트에 실리는 경로라, 기본값을 주는 쪽으로
    '고치는' 것을 막는다.
    """
    sig = inspect.signature(ask_context.build_plot_context)
    assert sig.parameters["user_id"].default is inspect.Parameter.empty
