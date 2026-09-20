"""위성 캐시의 **DB 를 안 쓰는 부분**만 본다.

여기가 지키는 것 둘 —

  1. 표의 Decimal·date 가 화면·프롬프트가 아는 float·문자열로 바뀐다
     이 한 칸이 어긋나면 차트가 빈 채로 그려지고 아무도 오류를 못 본다.
  2. 좌표 반올림 자리가 눈금과 맞는다
     잘게 나누면 같은 밭이 매번 다른 열쇠가 되어 표가 **조용히** 쓸모없어진다 —
     오류가 안 나고 그저 느릴 뿐이라 알아채기 어렵다.

적재·조회 자체는 DB 가 필요해 여기서 안 본다.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.service.satellite_cache import (
    CACHE_TTL,
    COORD_NDIGITS,
    READ_DAYS,
    _points_from,
    _반올림,
)


@dataclass
class 행:
    obs_date: date
    ndvi: Decimal | None
    ndmi: Decimal | None


def test_표의_값을_화면_모양으로_푼다():
    (점,) = _points_from([행(date(2026, 9, 18), Decimal("0.787"), Decimal("0.383"))])
    assert 점 == {"date": "2026-09-18", "ndvi": 0.787, "ndmi": 0.383}
    # ⚠ Decimal 을 그대로 두면 json 직렬화에서 터진다
    assert isinstance(점["ndvi"], float)


def test_빈_칸은_None_으로_남는다():
    """0.0 으로 채우지 않는다 — '관측이 없다'와 '값이 0이다'는 다른 말이다."""
    (점,) = _points_from([행(date(2026, 9, 18), None, None)])
    assert 점["ndvi"] is None
    assert 점["ndmi"] is None


def test_점이_없으면_빈_목록이다():
    assert _points_from([]) == []


def test_좌표_반올림이_화소_눈금과_맞는다():
    """4자리는 약 11m — Sentinel-2 화소(10m)·조회 폴리곤 반폭(15m)과 같은 눈금이다."""
    assert COORD_NDIGITS == 4
    assert _반올림(34.987654) == 34.9877
    # 예보용 자리(plot_tasks 의 2자리 ≈ 1.1km)와 섞이면 옆 밭 값을 읽는다
    assert COORD_NDIGITS > 2


def test_같은_밭의_미세한_차이는_같은_열쇠가_된다():
    """GPS 가 흔들려도 같은 칸으로 떨어져야 표가 쓸모 있다."""
    assert _반올림(34.98765) == _반올림(34.98767)


def test_11m_쯤_떨어지면_다른_열쇠다():
    """옆 밭을 우리 밭으로 읽으면 안 된다."""
    assert _반올림(34.9876) != _반올림(34.9880)


def test_캐시_수명이_하루보다_짧다():
    """관측이 18일에 한 번이지만 **언제 올지는 모른다.** 반나절이면 하루 안에 줍는다."""
    assert CACHE_TTL <= timedelta(days=1)
    # 너무 짧으면 표를 둔 뜻이 없다
    assert CACHE_TTL >= timedelta(hours=6)


def test_오래된_관측은_지금_것으로_안_친다():
    """★ 창과 신선도는 다른 값이다.

    창(READ_DAYS)은 "점을 찾아볼 범위" 이고, 신선도(SATELLITE_FRESH_DAYS)는 "그 점을
    지금 것으로 쳐도 되나" 다. 예전에는 창 안의 마지막 점을 그냥 썼는데, 구름이
    길게 끼면 그 점이 석 달 전 것일 수 있다.

    14일인 까닭은 이 값이 **물 카드를 막는** 데 쓰이기 때문이다 — 열흘 전 잎으로
    오늘 물 카드를 막으면 그 사이 마른 밭이 조용해진다. 실측(밭 6곳)으로 최장
    관측 간격이 11일이라 좁혀도 잃는 것이 없었다.
    """
    from app.service.plot_tasks import SATELLITE_FRESH_DAYS

    assert SATELLITE_FRESH_DAYS < READ_DAYS
    # 실측 최장(11일)보다는 넉넉해야 한 번 걸러도 안 놓친다
    assert SATELLITE_FRESH_DAYS >= 14
