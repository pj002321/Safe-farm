"""재배 상세의 작업카드가 **홈과 같은 방법으로 값을 모으는지** 지킨다.

`service/cultivation_tasks.py` 는 `plot_tasks` 의 밑줄 헬퍼 넷을 일부러 가져다
쓴다 — 베껴 오면 한쪽만 고쳐졌을 때 홈과 상세가 또 다른 말을 한다(그 파일이
생긴 이유가 바로 그것이다).

대신 밑줄 이름은 "바꿔도 되는 것" 이라는 신호라, 저쪽에서 이름을 갈면 **여기가
조용히 깨진다.** import 자체는 모듈을 읽는 순간 터지지만 그 순간이 배포 뒤일 수
있어, 이름과 인자 모양을 여기서 먼저 붙잡는다.

⚠ 이름을 바꿔야 하면 이 테스트를 고치지 말고 **두 파일을 같이** 고친다.
"""

import inspect

from app.service import cultivation_tasks, plot_tasks

#: 상세가 홈에서 빌려 쓰는 것. 이름 → 그 함수가 반드시 받아야 하는 인자 이름들.
BORROWED = {
    "_plot_weather": ("plot",),
    "_vegetation": ("db", "plot"),
    "_active_warnings": ("db", "plot"),
    "_recent_rain_mm": ("db", "station_code"),
}


def test_borrowed_helpers_still_exist():
    for name in BORROWED:
        assert hasattr(plot_tasks, name), f"plot_tasks.{name} 가 사라졌다"
        assert getattr(cultivation_tasks, name) is getattr(plot_tasks, name)


def test_borrowed_helpers_keep_their_parameters():
    for name, expected in BORROWED.items():
        params = tuple(inspect.signature(getattr(plot_tasks, name)).parameters)
        for arg in expected:
            assert arg in params, f"plot_tasks.{name} 의 인자 {arg} 가 사라졌다"


def test_split_is_shared_with_plot_growth():
    """단계 칸('가뭄,과습')을 쪼개는 규칙도 한 곳이어야 한다."""
    from app.service import plot_growth

    assert cultivation_tasks._split is plot_growth._split
