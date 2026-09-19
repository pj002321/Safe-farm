"""Open-Meteo 예보 캐시. 같은 자리를 잠깐 동안 다시 묻지 않는다.

`/weather` 화면은 밭마다 `/v1/weather/plot` 을 부르고, 밭 총평은 사용자의 밭을
차례로 돌며 예보를 받는다. 밭 셋이 같은 동네면 셋 다 같은 예보를 받아 오는데
예보는 시간 단위로만 바뀐다 — 그 셋을 하나로 줄인다.

캐시가 낼 수 있는 사고 둘을 여기서 막는다.
  · 받은 dict 를 부르는 쪽이 고치면 다음 요청까지 같이 틀어진다(사본을 준다).
  · 실패한 응답을 담으면 TTL 동안 장애가 고정된다(성공만 담는다).
"""

from types import SimpleNamespace

import pytest

from pipeline import open_meteo_client as client


class _FakeResponse:
    def __init__(self, payload, fail=False):
        self._payload = payload
        self._fail = fail

    def raise_for_status(self):
        if self._fail:
            raise RuntimeError("502")

    def json(self):
        return self._payload


@pytest.fixture(autouse=True)
def _clean_cache():
    client.clear_forecast_cache()
    yield
    client.clear_forecast_cache()


def _counting_get(payload, fail=False):
    calls = SimpleNamespace(n=0)

    def get(*_args, **_kwargs):
        calls.n += 1
        return _FakeResponse(payload, fail=fail)

    return get, calls


def test_same_coordinate_is_fetched_once(monkeypatch):
    get, calls = _counting_get({"daily": {"time": ["2026-09-19"]}})
    monkeypatch.setattr(client.requests, "get", get)

    client.fetch_forecast(37.5665, 126.9780)
    client.fetch_forecast(37.5665, 126.9780)

    assert calls.n == 1


def test_neighbouring_coordinates_share_one_call(monkeypatch):
    """반올림 자릿수가 캐시 적중률을 정한다. 좌표가 소수점 끝자리만 달라도 따로
    세면 캐시가 사실상 안 먹는다.

    칸 경계에 걸친 두 점은 여전히 따로 센다 — 반올림 방식의 대가이고, 그래도
    같은 밭을 반복해 부르는 화면에서는 늘 같은 칸이라 목적을 달성한다.
    """
    get, calls = _counting_get({"daily": {}})
    monkeypatch.setattr(client.requests, "get", get)

    client.fetch_forecast(37.56601, 126.97801)
    client.fetch_forecast(37.56649, 126.97849)

    assert calls.n == 1


def test_different_places_do_not_share(monkeypatch):
    get, calls = _counting_get({"daily": {}})
    monkeypatch.setattr(client.requests, "get", get)

    client.fetch_forecast(37.5665, 126.9780)
    client.fetch_forecast(35.1796, 129.0756)

    assert calls.n == 2


def test_expired_entry_is_fetched_again(monkeypatch):
    """시계를 TTL 너머로 옮긴다. 진짜로 기다리면 테스트가 10분 걸린다."""
    get, calls = _counting_get({"daily": {}})
    monkeypatch.setattr(client.requests, "get", get)

    now = [1000.0]
    monkeypatch.setattr(client.time, "monotonic", lambda: now[0])

    client.fetch_forecast(37.5665, 126.9780)
    now[0] += client.FORECAST_CACHE_TTL + 1
    client.fetch_forecast(37.5665, 126.9780)

    assert calls.n == 2


def test_cache_can_be_turned_off(monkeypatch):
    """예보가 이상할 때 캐시 탓인지 가르는 스위치. 0 이면 매번 받아 온다."""
    get, calls = _counting_get({"daily": {}})
    monkeypatch.setattr(client.requests, "get", get)
    monkeypatch.setattr(client, "FORECAST_CACHE_TTL", 0)

    client.fetch_forecast(37.5665, 126.9780)
    client.fetch_forecast(37.5665, 126.9780)

    assert calls.n == 2


def test_caller_cannot_corrupt_the_cache(monkeypatch):
    """돌려준 dict 를 고쳐도 다음 사람이 받는 값은 그대로여야 한다."""
    get, _ = _counting_get({"daily": {"temperature_2m_max": [21.0]}})
    monkeypatch.setattr(client.requests, "get", get)

    first = client.fetch_forecast(37.5665, 126.9780)
    first["daily"]["temperature_2m_max"][0] = 999.0
    second = client.fetch_forecast(37.5665, 126.9780)

    assert second["daily"]["temperature_2m_max"] == [21.0]


def test_failure_is_not_cached(monkeypatch):
    """장애 응답을 담으면 TTL 이 끝날 때까지 복구돼도 계속 실패로 보인다."""
    get, calls = _counting_get({}, fail=True)
    monkeypatch.setattr(client.requests, "get", get)

    for _ in range(2):
        with pytest.raises(RuntimeError):
            client.fetch_forecast(37.5665, 126.9780)

    assert calls.n == 2


def test_cache_does_not_grow_without_bound(monkeypatch):
    """배치가 전국을 돌면 좌표가 수천 개다. 오래된 것부터 버린다."""
    get, _ = _counting_get({"daily": {}})
    monkeypatch.setattr(client.requests, "get", get)
    monkeypatch.setattr(client, "CACHE_MAX_ENTRIES", 5)

    for i in range(20):
        client.fetch_forecast(35.0 + i / 100, 127.0)

    assert len(client._cache) == 5
