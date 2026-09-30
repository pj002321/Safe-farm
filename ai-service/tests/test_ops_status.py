from datetime import UTC, datetime, timedelta

from app.domain.ops_status import Feed, is_stale, job_of

NOW = datetime(2026, 10, 1, tzinfo=UTC)


def test_is_stale():
    fresh = Feed("a", "a", "cron", NOW - timedelta(hours=1), 2)
    old = Feed("b", "b", "cron", NOW - timedelta(hours=3), 2)
    empty = Feed("c", "c", "cron", None, 2)
    unjudged = Feed("d", "d", "on-demand", None, None)
    assert [is_stale(f, NOW) for f in (fresh, old, empty, unjudged)] == [False, True, True, None]


def test_job_of():
    assert job_of('{"job":"tasks","error":"timeout"}') == "tasks"
    assert job_of("<html>502</html>") is None
    assert job_of(None) is None
    assert job_of("[1]") is None
