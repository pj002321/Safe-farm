"""예보 미리 받기. 네트워크 없이 `_fetch_plot_weather` 를 가로채 본다.

★ 이 파일의 전부는 **"빨라지되 값은 그대로"** 다. 미리 받기는 최적화라서,
  틀려도 카드가 안 나거나 이상해질 뿐 예외로 드러나지 않는다 — 그래서 잠가 둔다.
"""

from unittest.mock import patch

from app.domain.water_balance import WaterBalance
from app.service.plot_tasks import _memo_key, _plot_weather, _prefetch_weather


class 가짜밭:
    """plots 행에서 미리 받기가 보는 것은 위경도뿐이다."""

    def __init__(self, lat, lon):
        self.latitude = lat
        self.longitude = lon


def _받은척(호출들):
    """부른 좌표를 적어 두고 빈 예보를 돌려주는 대역."""

    def 대역(lat, lon):
        호출들.append((lat, lon))
        return type("_W", (), {"water": WaterBalance(), "tomorrow": None})()

    return 대역


def test_미리_받아_두면_루프가_다시_안_부른다():
    # 열쇠가 어긋나면 미리 받고도 또 부른다 — 느려질 뿐 티가 안 나서 위험하다
    밭 = 가짜밭(36.4117806052, 128.1579312345)
    호출 = []
    memo = {}
    with patch("app.service.plot_tasks._fetch_plot_weather", _받은척(호출)):
        _prefetch_weather([밭], memo)
        앞 = len(호출)
        _plot_weather(밭, memo)
    assert 앞 == 1
    assert len(호출) == 1, "루프가 또 불렀다 — _memo_key 가 두 곳에서 어긋났다"


def test_같은_마을_밭_둘은_한_번만_부른다():
    # _COORD_NDIGITS(2자리 ≈ 1km) 로 뭉친다
    밭들 = [가짜밭(36.41178, 128.15793), 가짜밭(36.41002, 128.15501)]
    호출 = []
    with patch("app.service.plot_tasks._fetch_plot_weather", _받은척(호출)):
        _prefetch_weather(밭들, {})
    assert len(호출) == 1


def test_열쇠가_아니라_실제_밭_좌표로_부른다():
    # 열쇠(반올림 좌표)로 부르면 300~600m 옆을 묻게 된다. 실측으로 수지가 어긋났다
    밭 = 가짜밭(36.4117806052, 128.1579312345)
    호출 = []
    with patch("app.service.plot_tasks._fetch_plot_weather", _받은척(호출)):
        _prefetch_weather([밭], {})
    assert 호출 == [(36.4117806052, 128.1579312345)]
    assert 호출[0] != _memo_key(밭)


def test_이미_받아_둔_좌표는_안_부른다():
    밭 = 가짜밭(36.41178, 128.15793)
    memo = {_memo_key(밭): "이미 있음"}
    호출 = []
    with patch("app.service.plot_tasks._fetch_plot_weather", _받은척(호출)):
        _prefetch_weather([밭], memo)
    assert 호출 == []
    assert memo[_memo_key(밭)] == "이미 있음"


def test_좌표_없는_밭이_섞여도_안_터진다():
    # 그 밭 하나의 문제다. 미리 받기가 대신 터지면 멀쩡한 밭까지 느려진다
    밭들 = [가짜밭(None, None), 가짜밭(36.41178, 128.15793)]
    호출 = []
    with patch("app.service.plot_tasks._fetch_plot_weather", _받은척(호출)):
        _prefetch_weather(밭들, {})
    assert len(호출) == 1


def test_스레드풀이_터져도_배치를_안_멈춘다():
    # 미리 받기는 최적화다. 실패하면 memo 가 빈 채로 돌아가고 루프가 제 발로 받는다
    memo = {}
    with patch("app.service.plot_tasks.ThreadPoolExecutor", side_effect=OSError("스레드 못 만듦")):
        _prefetch_weather([가짜밭(36.41178, 128.15793)], memo)
    assert memo == {}
