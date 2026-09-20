"""요청 범위 마스터 캐시. 같은 요청 안에서 같은 질문을 두 번 하지 않는다.

`/v1/weather/plot` 하나가 `usable_crop_of_variant` 를 세 번 부른다
(daily_gdd_series · crop_interpretation · compute_plot_growth 가 저마다 필요해서).
자정 배치는 밭마다 부르는데, 같은 작물을 기르는 밭이 여럿이면 그만큼 겹친다.

캐시의 위험은 "언제 비우나"인데, 여기서는 그 질문이 생기지 않는다 — 세션이 닫히면
같이 사라지고, 담는 것은 요청 도중에 바뀌지 않는 정적 마스터뿐이다.
"""

from app.core.request_cache import clear, memo


class _FakeSession:
    """`info` 만 있으면 된다. 진짜 Session 에도 원래 있는 dict 다."""

    def __init__(self):
        self.info: dict = {}


def test_second_call_does_not_hit_the_source():
    db = _FakeSession()
    calls = []

    def produce():
        calls.append(1)
        return "배추"

    assert memo(db, ("crop", 7), produce) == "배추"
    assert memo(db, ("crop", 7), produce) == "배추"
    assert len(calls) == 1


def test_none_is_remembered_too():
    """'없더라'를 기억하지 않으면 없는 id 를 물을 때마다 매번 DB 를 친다.
    작물이 지워진 재배 건이 실제로 있었다."""
    db = _FakeSession()
    calls = []

    def produce():
        calls.append(1)
        return None

    assert memo(db, ("crop", 99), produce) is None
    assert memo(db, ("crop", 99), produce) is None
    assert len(calls) == 1


def test_different_keys_do_not_collide():
    db = _FakeSession()

    assert memo(db, ("crop", 1), lambda: "상추") == "상추"
    assert memo(db, ("crop", 2), lambda: "배추") == "배추"


def test_same_argument_in_different_lookups_does_not_collide():
    """키에 함수 이름을 같이 넣는 이유. id 7 의 '숙기' 와 id 7 의 '작물' 은 다르다."""
    db = _FakeSession()

    assert memo(db, ("variant_by_id", 7), lambda: "숙기7") == "숙기7"
    assert memo(db, ("usable_crop_of_variant", 7), lambda: "작물7") == "작물7"


def test_sessions_do_not_share():
    """세션이 캐시의 경계다. 새어 나가면 한 사용자의 요청이 다음 요청에 영향을 준다."""
    first, second = _FakeSession(), _FakeSession()
    memo(first, ("crop", 7), lambda: "상추")

    assert memo(second, ("crop", 7), lambda: "배추") == "배추"


def test_clear_forces_a_reload():
    db = _FakeSession()
    memo(db, ("crop", 7), lambda: "상추")

    clear(db)

    assert memo(db, ("crop", 7), lambda: "배추") == "배추"
