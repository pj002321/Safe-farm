from app.domain.warn_region import active_wrn_kinds, ancestors, classify_warning


def test_ancestors_walks_up_to_national():
    reg_up = {"L1071200": "L1070000", "L1070000": "L1000000", "L1000000": "00000000"}
    assert ancestors("L1071200", reg_up) == ["L1071200", "L1070000", "L1000000"]


def test_ancestors_stops_without_parent():
    assert ancestors("L1071200", {}) == ["L1071200"]


def test_active_wrn_kinds_matches_self_or_ancestor():
    alerts = [{"reg_id": "L1070000", "wrn": "강풍"}, {"reg_id": "L9999999", "wrn": "호우"}]
    assert active_wrn_kinds({"L1071200", "L1070000", "L1000000"}, alerts) == ["강풍"]


def test_active_wrn_kinds_excludes_fog_and_dust():
    alerts = [{"reg_id": "L1071200", "wrn": "안개"}, {"reg_id": "L1071200", "wrn": "황사"}]
    assert active_wrn_kinds({"L1071200"}, alerts) == []


def test_active_wrn_kinds_dedupes_keeping_order():
    alerts = [
        {"reg_id": "L1071200", "wrn": "강풍"},
        {"reg_id": "L1071200", "wrn": "호우"},
        {"reg_id": "L1071200", "wrn": "강풍"},
    ]
    assert active_wrn_kinds({"L1071200"}, alerts) == ["강풍", "호우"]


def test_classify_warning_no_active_returns_no_color():
    assert classify_warning([]) == (None, None)


def test_classify_warning_joins_multiple_kinds():
    color, label = classify_warning(["강풍", "호우"])
    assert color == "#dc2626"
    assert label == "강풍·호우 특보"
