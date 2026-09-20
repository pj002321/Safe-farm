"""예보 TTL 캐시. 네트워크 없이 `fetch_forecast` 를 가로채 본다.

★ 이 파일의 절반은 **자정**이다. 예보 응답은 받을 때 '오늘' 을 정해 tomorrow 와
  과거 14일 창을 잘라 둔다. 자정을 넘겨 그대로 쓰면 tomorrow 가 사실은 오늘이 되어
  서리·폭염 카드가 하루 어긋난 예보로 나간다 — 그런데 **할 일 배치가 00시에 돈다.**
"""

from datetime import timedelta
from unittest.mock import patch

import pytest

from app.service import forecast_cache as fc


@pytest.fixture(autouse=True)
def _빈_캐시():
    """모듈 수준 사전이라 **테스트끼리 샌다.** 앞뒤로 비운다 —
    안 비우면 여기서 담은 가짜 응답이 다른 파일의 테스트로 넘어가고,
    그때는 실행 차례에 따라 붙었다 떨어졌다 한다."""
    yield
    fc.clear()


def _센다(응답=None):
    """부른 횟수를 적어 두는 대역."""
    호출 = []

    def 대역(lat, lon, past_days=0):
        호출.append((lat, lon, past_days))
        return 응답 if 응답 is not None else {"daily": {"time": []}}

    return 호출, 대역


def test_같은_좌표를_다시_물으면_안_부른다():
    호출, 대역 = _센다()
    with patch.object(fc, "fetch_forecast", 대역):
        a = fc.forecast(36.41, 128.16, past_days=14)
        b = fc.forecast(36.41, 128.16, past_days=14)
    assert len(호출) == 1
    assert a is b


def test_1km_안쪽_좌표는_한_항목으로_묶인다():
    호출, 대역 = _센다()
    with patch.object(fc, "fetch_forecast", 대역):
        fc.forecast(36.4117806052, 128.1579312345)
        fc.forecast(36.4100000000, 128.1600000000)
    assert len(호출) == 1


def test_past_days_가_다르면_다른_항목이다():
    # 섞이면 배열 길이가 달라 **날짜가 밀린다**
    호출, 대역 = _센다()
    with patch.object(fc, "fetch_forecast", 대역):
        fc.forecast(36.41, 128.16, past_days=0)
        fc.forecast(36.41, 128.16, past_days=14)
    assert len(호출) == 2


def test_TTL_이_지나면_다시_받는다():
    호출, 대역 = _센다()
    with patch.object(fc, "fetch_forecast", 대역):
        fc.forecast(36.41, 128.16)
        _늙히기(지난시간=fc.CACHE_TTL + timedelta(seconds=1))
        fc.forecast(36.41, 128.16)
    assert len(호출) == 2


def test_자정을_넘기면_TTL_이_남아도_다시_받는다():
    # ★ 00시 배치가 23:30 에 담긴 것을 집으면 tomorrow 가 오늘이 된다
    호출, 대역 = _센다()
    with patch.object(fc, "fetch_forecast", 대역):
        fc.forecast(36.41, 128.16)
        _늙히기(지난시간=timedelta(minutes=30), 지난날=1)
        fc.forecast(36.41, 128.16)
    assert len(호출) == 2, "자정을 넘긴 예보를 그대로 썼다"


def test_실패는_담지_않는다():
    # 잠깐 죽은 것을 한 시간 붙들면 복구된 뒤에도 카드가 계속 얇게 나간다
    with patch.object(fc, "fetch_forecast", side_effect=OSError("죽음")):
        try:
            fc.forecast(36.41, 128.16)
        except OSError:
            pass
    assert fc._cache == {}


def test_지난_항목은_쓸_때_치워진다():
    # 좌표가 늘어도 사전이 안 불어나야 한다
    _, 대역 = _센다()
    with patch.object(fc, "fetch_forecast", 대역):
        fc.forecast(36.41, 128.16)
        _늙히기(지난시간=fc.CACHE_TTL + timedelta(seconds=1))
        fc.forecast(35.10, 129.00)   # 다른 좌표를 담으면서 쓸어낸다
    assert len(fc._cache) == 1


def _늙히기(지난시간=timedelta(0), 지난날=0):
    """사전에 든 항목들을 과거로 밀어 둔다."""
    with fc._lock:
        for 열쇠, 항목 in list(fc._cache.items()):
            fc._cache[열쇠] = fc._Entry(
                payload=항목.payload,
                made_at=항목.made_at - 지난시간,
                made_on=항목.made_on - timedelta(days=지난날),
            )
