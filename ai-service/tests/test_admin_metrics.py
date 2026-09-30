from datetime import UTC, datetime, timedelta

from app.domain.ops_status import hourly_counts, route_stats
from app.domain.retrieval_eval import reciprocal_rank, summarize
from app.domain.stage_accuracy import summarize_errors

NOW = datetime(2026, 10, 1, 12, tzinfo=UTC)


def test_route_stats_sorts_slowest_first():
    records = [(NOW, "GET /a", 200, 10.0), (NOW, "GET /a", 500, 30.0), (NOW, "GET /b", 200, 100.0)]
    out = route_stats(records)
    assert [r["route"] for r in out] == ["GET /b", "GET /a"]
    assert out[1] == {"route": "GET /a", "count": 2, "avgMs": 20, "p95Ms": 30, "errors": 1}


def test_hourly_counts():
    times = [NOW, NOW - timedelta(minutes=30), NOW - timedelta(hours=2, minutes=1), NOW - timedelta(hours=9)]
    assert hourly_counts(times, 3, NOW) == [1, 0, 2]


def test_retrieval_metrics():
    assert reciprocal_rank(["a", "b", "c"], "b") == 0.5
    assert reciprocal_rank(["a"], "z") == 0.0
    results = [
        {"sources": ["x", "y"], "expected": "x", "hint": True},
        {"sources": ["y", "x"], "expected": "x", "hint": False},
        {"sources": ["y"], "expected": "x", "hint": False},
    ]
    assert summarize(results) == {"n": 3, "recall": 0.667, "mrr": 0.5, "hint": 0.333}


def test_stage_errors_exclude_unusable():
    rows = [
        {"predicted": 3, "actual": 4, "stage": "개화", "usable": True},
        {"predicted": 5, "actual": 4, "stage": "개화", "usable": True},
        {"predicted": 2, "actual": 2, "stage": "정식", "usable": True},
        {"predicted": 1, "actual": 4, "stage": "개화", "usable": False},
        {"predicted": None, "actual": 1, "stage": "?", "usable": True},
    ]
    out = summarize_errors(rows)
    assert (out["n"], out["excluded"], out["mae"], out["bias"]) == (3, 2, 0.67, 0.0)
    assert out["byStage"] == [{"stage": "개화", "n": 2, "mae": 1.0}, {"stage": "정식", "n": 1, "mae": 0.0}]
