"""`/v1/weather/plot` 이 남의 밭 값을 내주지 않는지.

예보·강수량은 좌표만 있으면 나오는 값이라 막을 것이 없다. 여기서 지키는 것은
**밭에 딸린 세 가지**다 — `growthSeries`(생육), `cropImpact`(작물·생육단계),
`alert`(그 밭 특보). 이것들은 밭 주인의 정보다.

이 경로는 전에 `live_plot` 을 썼다. 소유를 안 보는 함수라 plot_id 만 맞으면
남의 밭 작물이 그대로 나갔다. 되돌아가면 이 파일이 깨진다.
"""

import uuid
from types import SimpleNamespace

import pytest

from app.api import weather

LAT, LON = 36.4084, 128.1574

MINE = uuid.UUID("11111111-1111-1111-1111-111111111111")
SOMEONE_ELSE = uuid.UUID("22222222-2222-2222-2222-222222222222")
PLOT = uuid.UUID("33333333-3333-3333-3333-333333333333")


class _Plot:
    """밭 객체는 그대로 흘려보내기만 한다. 격자만 있으면 된다 — 예보 열쇠에 쓴다."""

    grid_x, grid_y = 52, 67


@pytest.fixture
def wired(monkeypatch):
    """DB 와 외부 예보를 전부 바꿔 끼우고, owned_plot 이 받은 인자를 기록한다."""
    calls: list[tuple] = []

    monkeypatch.setattr(
        weather,
        "cached_forecast",
        lambda lat, lon, *, cache_key=None: {
            "current": {"time": "2026-09-19T08:00", "temperature_2m": 20.0},
            "hourly": {"time": [], "temperature_2m": []},
            "daily": {"time": []},
        },
    )
    monkeypatch.setattr(weather, "normalize_daily_forecast", lambda daily: [])
    monkeypatch.setattr(weather, "normalize_hourly", lambda hourly, since: [])
    # 관측소가 있어야 생육 계열이 나온다 — 없으면 소유와 무관하게 전부 None 이라
    # 이 테스트가 통과해도 아무것도 증명하지 못한다.
    station = SimpleNamespace(station_code="279")
    monkeypatch.setattr(weather, "nearest_station", lambda db, coord: station)
    monkeypatch.setattr(weather, "rainfall_totals", lambda db, code: {3: 0.0, 5: 0.0, 7: 0.0})

    # 밭이 확인됐을 때만 채워지는 값들. 하나라도 나오면 소유 확인을 통과한 것이다.
    monkeypatch.setattr(
        weather, "plot_warning", lambda db, lat, lon: ({"warnings": ["호우"]}, None)
    )
    monkeypatch.setattr(weather, "daily_gdd_series", lambda db, plot, station: [1.0])
    monkeypatch.setattr(weather, "crop_interpretation", lambda db, plot, station: None)

    def owned(db, plot_id, user_id):
        calls.append((plot_id, user_id))
        return _Plot() if user_id == MINE else None

    monkeypatch.setattr(weather, "owned_plot", owned)
    return calls


def _call(**kwargs):
    return weather.plot_forecast(lat=LAT, lon=LON, db=None, **kwargs)


def test_plot_id_without_user_id_gets_no_plot_data(wired):
    """Next 가 아직 user_id 를 안 보내는 동안의 모습. 거절하지는 않는다."""
    result = _call(plot_id=PLOT)

    assert result["growthSeries"] is None
    assert result["cropImpact"] is None
    assert result["alert"] is None
    assert wired == [], "소유를 못 가리는데 밭을 조회했다"


def test_plot_id_without_user_id_still_returns_the_forecast(wired):
    """좌표 부분까지 죽이면 예보 카드가 통째로 사라진다."""
    result = _call(plot_id=PLOT)

    assert result["current"] is not None
    assert "rainfall7d" in result


def test_someone_elses_plot_yields_nothing(wired):
    result = _call(plot_id=PLOT, user_id=SOMEONE_ELSE)

    assert result["growthSeries"] is None
    assert result["alert"] is None


def test_my_own_plot_yields_plot_data(wired):
    result = _call(plot_id=PLOT, user_id=MINE)

    assert result["growthSeries"] == [1.0]
    assert result["alert"]["warnings"] == ["호우"]


def test_user_id_is_actually_passed_to_the_query(wired):
    """소유 확인을 빼고 live_plot 으로 되돌리면 여기가 깨진다."""
    _call(plot_id=PLOT, user_id=MINE)

    assert wired == [(PLOT, MINE)]


def _keys_seen(monkeypatch):
    """예보에 넘어간 `cache_key` 를 적어 두는 대역을 끼운다."""
    keys = []

    def stub(lat, lon, *, cache_key=None):
        keys.append(cache_key)
        return {"current": None, "hourly": {"time": []}, "daily": {"time": []}}

    monkeypatch.setattr(weather, "cached_forecast", stub)
    return keys


def test_my_own_plot_is_keyed_by_grid(wired, monkeypatch):
    """밭을 **예보보다 먼저** 찾아야 격자를 열쇠로 쓸 수 있다.

    순서를 되돌리면 열쇠가 None 이 되어 좌표로 묶인다. 한 격자 안의 밭들이
    각각 밖으로 나가는데, Next 는 URL 에 plot_id 가 들어가 밭마다 따로
    캐시하므로 저쪽이 안 막아 준다 — 느려질 뿐 값은 맞아서 티가 안 난다.
    """
    keys = _keys_seen(monkeypatch)
    _call(plot_id=PLOT, user_id=MINE)

    assert keys == [("grid", 52, 67)], "밭 조회가 예보 뒤로 밀렸다"


def test_plotless_call_is_keyed_by_coords(wired, monkeypatch):
    """지도에서 찍은 좌표에는 밭이 없다. 열쇠도 없이 좌표로 묶인다."""
    keys = _keys_seen(monkeypatch)
    _call()

    assert keys == [None]


def test_missing_plot_looks_the_same_as_someone_elses(wired):
    """없는 밭과 남의 밭을 구분해 알리면 '그 id 의 밭이 있다' 가 샌다."""
    mine_but_gone = _call(plot_id=PLOT, user_id=SOMEONE_ELSE)
    no_plot_at_all = _call()

    for key in ("growthSeries", "cropImpact", "alert"):
        assert mine_but_gone[key] == no_plot_at_all[key]
