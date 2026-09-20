"""밭의 **작물마다** 판정한다(교안 §2-B). 네트워크·DB 없이 서비스 층만 가로챈다.

★ 이 파일이 지키는 것은 셋이다.

    ① 같은 제목이 두 장 안 꽂힌다   같은 밭에 **파종일까지 같은 재배가 실재한다**
                                   (2026-09-20 실측: 풋콩 2건 · 피망 2건).
                                   DB 에 유일 제약이 없어 조용히 늘어난다
    ② 재해 카드는 밭에 한 장        특보는 밭에 내리는 것이지 작물에 내리는 게 아니다
    ③ 작물 하나가 막혀도 계속       막힌 한 건이 밭 전체를 같이 막고 있었다
                                   (2026-09-20 실측: 디테크타워 과천의 단감 —
                                    crops.base_temp 가 비어 GDD 를 못 낸다)

⚠ ①은 **이 변경이 새로 만드는 버그**다. 작물 하나만 돌 때는 없던 문제라,
  고치고 나서도 다음 사람이 무심코 되돌리기 쉽다.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import patch

from app.domain.task_rules import TaskCandidate
from app.domain.water_balance import WaterBalance
from app.service import plot_tasks


class 가짜세션:
    """이 경로가 세션에 쓰는 것은 commit 뿐이다 — 조회는 전부 대역이 가로챈다."""

    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


def 재배(sowing_date="2026-04-01", variant_id=1):
    return SimpleNamespace(
        id=uuid.uuid4(), variant_id=variant_id, sowing_date=sowing_date
    )


def 생육(crop_name_ko):
    return SimpleNamespace(
        crop_name_ko=crop_name_ko,
        stage_name="한창때",
        irrigate_needed=True,
        stage_hazards=(),
        stage_tasks=(),
        fertilize_needed=False,
        accumulated_gdd=100.0,
        gdd_target=None,
        sow_method="씨뿌림",
    )


def _돌린다(cultivations, growths, 후보들, 만들어진제목=()):
    """`generate_tasks_for_plot` 을 대역으로 감싸 돌리고, 붙은 카드 제목을 돌려준다.

    # params
    cultivations: 밭이 기르는 재배 건들 (차례 그대로)<br>
    growths: 재배 건마다 `cultivation_growth` 가 낼 값. None 이면 못 낸 것<br>
    후보들: `build_task_candidates` 가 낼 카드. 부를 때마다 하나씩 꺼낸다<br>
    만들어진제목: 이미 살아 있는 카드 제목들<br>

    # returns
    (붙은 제목 목록, 넘어간 warnings 목록)
    """
    plot = SimpleNamespace(id=uuid.uuid4(), latitude=36.4, longitude=128.1)
    db = 가짜세션()
    붙은 = []
    받은warnings = []
    남은생육 = list(growths)
    남은후보 = list(후보들)

    def 판정(inputs):
        받은warnings.append(inputs.warnings)
        return 남은후보.pop(0)

    with (
        patch.object(plot_tasks, "expire_stale_tasks", lambda *a, **k: 0),
        patch.object(plot_tasks, "nearest_station", lambda *a: SimpleNamespace(station_code="101")),
        patch.object(plot_tasks, "growing_in_order", lambda *a: list(cultivations)),
        patch.object(plot_tasks, "cultivation_growth", lambda *a: 남은생육.pop(0)),
        patch.object(
            plot_tasks,
            "_plot_weather",
            lambda *a, **k: plot_tasks._PlotWeather(WaterBalance()),
        ),
        patch.object(plot_tasks, "_vegetation", lambda *a: None),
        patch.object(plot_tasks, "_active_warnings", lambda *a, **k: ("호우",)),
        patch.object(plot_tasks, "_recent_rain_mm", lambda *a: None),
        patch.object(
            plot_tasks,
            "temp_limits_for",
            lambda *a: SimpleNamespace(frost_c=None, heat_c=None),
        ),
        patch.object(plot_tasks, "pest_names_for", lambda *a: ()),
        patch.object(plot_tasks, "usable_crop_of_variant", lambda *a: None),
        patch.object(plot_tasks, "open_titles", lambda *a: set(만들어진제목)),
        patch.object(plot_tasks, "build_task_candidates", 판정),
        patch.object(
            plot_tasks,
            "add_task",
            lambda db, pid, title, reason, priority: 붙은.append(title),
        ),
    ):
        plot_tasks.generate_tasks_for_plot(db, plot)

    return 붙은, 받은warnings


def 카드(title):
    return [TaskCandidate(title=title, reason="그럴 때다", priority="mid")]


def test_같은_제목은_두_장_안_꽂힌다():
    # 파종일까지 같은 재배 둘 — 제목이 통째로 겹친다. DB 에 유일 제약이 없다
    붙은, _ = _돌린다(
        [재배(), 재배()],
        [생육("피망"), 생육("피망")],
        [카드("피망밭 물 주기"), 카드("피망밭 물 주기")],
    )

    assert 붙은 == ["피망밭 물 주기"], "같은 카드가 두 장 꽂혔다"


def test_이미_살아_있는_제목도_막는다():
    붙은, _ = _돌린다(
        [재배()], [생육("양파")], [카드("양파밭 물 주기")], 만들어진제목=("양파밭 물 주기",)
    )

    assert 붙은 == []


def test_재해는_첫_작물에만_넘긴다():
    """특보는 밭에 내린다. 작물 수만큼 같은 카드가 나가면 안 된다."""
    _, warnings = _돌린다(
        [재배(), 재배("2026-05-01", 2), 재배("2026-06-01", 3)],
        [생육("시금치"), 생육("양파"), 생육("마늘")],
        [카드("a"), 카드("b"), 카드("c")],
    )

    assert warnings == [("호우",), (), ()]


def test_판정을_못_낸_작물은_재해를_물려준다():
    """첫 작물이 막히면 그 다음 작물이 재해를 받는다 — 안 그러면 특보가 통째로 빈다."""
    _, warnings = _돌린다(
        [재배(None), 재배()],
        [None, 생육("양파")],
        [카드("양파밭 물 주기")],
    )

    assert warnings == [("호우",)]


def test_작물_하나가_막혀도_나머지는_계속_본다():
    """막힌 한 건이 밭 전체를 같이 막고 있었다(실측: 디테크타워 과천의 단감)."""
    붙은, _ = _돌린다(
        [재배(None), 재배()],
        [None, 생육("양파")],
        [카드("양파밭 물 주기")],
    )

    assert 붙은 == ["양파밭 물 주기"]
