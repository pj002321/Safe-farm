"""태풍 경로 캐시. 네트워크 없이 `fetch_typhoon_track` 을 가로채 본다.

★ 이 파일의 절반은 **실패를 담는가** 다. 기상청 호출은 `kma_client` 에서
  `timeout=20` 이라, 실패를 안 담으면 **요청마다 20초를 기다린다.**
  실측(2026-09-20): 재배 상세를 열 때 간헐적으로 20초가 걸려 버튼이 멈춘 듯 보였다.
"""

from datetime import timedelta
from unittest.mock import patch

import pytest

from app.service import typhoon_cache as tc


@pytest.fixture(autouse=True)
def _빈_캐시():
    """모듈 수준 값이라 **테스트끼리 샌다.** 앞뒤로 비운다."""
    tc.clear()
    yield
    tc.clear()


def _세는_대역(결과=None, 터뜨릴까=False):
    """부른 횟수를 적어 두는 대역."""
    호출: list[int] = []

    def 대역(_api_key):
        호출.append(1)
        if 터뜨릴까:
            raise OSError("기상청 죽음")
        return 결과 if 결과 is not None else [{"ft": 0}]

    return 호출, 대역


def test_한_번만_받아_온다():
    호출, 대역 = _세는_대역()
    with patch.object(tc, "fetch_typhoon_track", 대역):
        tc.track("키")
        tc.track("키")
        tc.track("키")
    assert len(호출) == 1


def test_실패도_담는다():
    # ★ 안 담으면 요청마다 20초(kma_client 의 timeout)를 기다린다
    호출, 대역 = _세는_대역(터뜨릴까=True)
    with patch.object(tc, "fetch_typhoon_track", 대역):
        첫 = tc.track("키")
        tc.track("키")
    assert len(호출) == 1, "실패를 안 담아 또 불렀다 — 매 요청이 20초가 된다"
    assert 첫 == []


def test_실패는_짧게만_담는다():
    # 기상청이 잠깐 죽은 것이라면 금방 돌아온다. 오래 붙들면 태풍 카드가 계속 빈다
    호출, 대역 = _세는_대역(터뜨릴까=True)
    with patch.object(tc, "fetch_typhoon_track", 대역):
        tc.track("키")
        _늙히기(tc.FAIL_TTL + timedelta(seconds=1))
        tc.track("키")
    assert len(호출) == 2


def test_성공은_실패보다_오래_담는다():
    # FAIL_TTL 만큼 지나도 성공한 값은 살아 있어야 한다
    호출, 대역 = _세는_대역()
    with patch.object(tc, "fetch_typhoon_track", 대역):
        tc.track("키")
        _늙히기(tc.FAIL_TTL + timedelta(seconds=1))
        tc.track("키")
    assert len(호출) == 1
    assert tc.FAIL_TTL < tc.CACHE_TTL


def test_TTL_이_지나면_다시_받는다():
    호출, 대역 = _세는_대역()
    with patch.object(tc, "fetch_typhoon_track", 대역):
        tc.track("키")
        _늙히기(tc.CACHE_TTL + timedelta(seconds=1))
        tc.track("키")
    assert len(호출) == 2


def test_키가_없으면_부르지_않는다():
    호출, 대역 = _세는_대역()
    with patch.object(tc, "fetch_typhoon_track", 대역):
        assert tc.track("") == []
    assert len(호출) == 0


def _늙히기(지난시간: timedelta) -> None:
    """담아 둔 것을 과거로 민다."""
    with tc._lock:
        항목 = tc._entry
        assert 항목 is not None
        tc._entry = tc._Entry(
            rows=항목.rows,
            made_at=항목.made_at - 지난시간,
            failed=항목.failed,
        )
