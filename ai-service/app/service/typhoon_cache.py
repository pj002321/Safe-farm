"""기상청 태풍 경로를 **잠깐** 들고 있는다.

★ 2026-09-20 — 재배 상세를 열 때마다 기상청으로 왕복이 한 번씩 나갔다.

      tasks_for_cultivation → _active_warnings → _fetch_typhoon_forecast
      실측: 정상 550ms · 나쁘면 **20초**(kma_client 의 timeout=20 에 걸린다)

  간헐적으로 20초가 걸려 버튼이 멈춘 것처럼 보였다. 배치(`generate_daily_tasks`)는
  한 번 받아 밭마다 넘겨 쓰는데(`typhoon_forecast` 인자), **화면 경로가 그 인자를
  안 넘겨** 매번 새로 받고 있었다.

⚠ **태풍이 없어도 부른다.** `is_approaching` 이 거짓이어도 왕복은 이미 나간 뒤다.
  그래서 "태풍이 올 때만 느리다" 가 아니라 **늘 느리다.**

⚠ 기상청 발표는 **3시간마다**(하루 8회)다. 1시간이면 새 발표를 늦어도 한 시간 안에
  잡는다 — `forecast_cache` 와 같은 값으로 두어 둘을 따로 외울 일을 없앤다.

⚠ **`forecast_cache` 와 한 가지가 다르다 — 실패도 담는다.**
  저쪽은 *"실패는 안 담는다. 잠깐 죽은 것을 한 시간 붙들면 복구된 뒤에도 카드가
  계속 얇게 나간다"* 였다. 여기는 반대다 —

      저쪽의 실패   값이 빈다            → 다시 물어 보는 편이 낫다
      이쪽의 실패   **20초를 기다린다**   → 다시 물으면 매 요청이 20초다

  그래서 실패는 짧게(`FAIL_TTL`) 담아 둔다. 그동안은 태풍 카드가 안 나가지만,
  화면이 멈추는 것보다 낫다.

쓰는 곳 셋 — `api/typhoon.py`(지도) · `service/ask_extras.py`(질문답변) ·
`service/plot_tasks.py`(할 일 카드). 셋 다 같은 원본 행을 받아 각자 푼다.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from pipeline.kma_client import fetch_typhoon_track

#: 받아 온 것을 들고 있는 시간. 기상청 발표가 3시간마다라 1시간이면 넉넉하다.
#: `forecast_cache.CACHE_TTL` 과 같은 값이다 — 두 개를 따로 외우지 않게.
CACHE_TTL = timedelta(hours=1)

#: **실패를 들고 있는 시간.** 성공보다 훨씬 짧다 — 기상청이 잠깐 죽은 것이라면
#: 금방 돌아오므로 오래 붙들 이유가 없다. 다만 0 으로 두면 매 요청이 20초를
#: 기다리게 되므로 반드시 0보다 커야 한다.
FAIL_TTL = timedelta(minutes=2)


@dataclass(frozen=True)
class _Entry:
    rows: list[dict]
    made_at: datetime
    #: 받아 오다 실패했나. 짧게 버린다(`FAIL_TTL`)
    failed: bool


_entry: _Entry | None = None
#: 값 하나만 지킨다. **네트워크 호출은 절대 이 안에서 하지 않는다** —
#: 잠근 채로 부르면 기다리는 요청이 전부 20초를 같이 선다.
_lock = threading.Lock()


def _is_fresh(entry: _Entry, now: datetime) -> bool:
    return now - entry.made_at < (FAIL_TTL if entry.failed else CACHE_TTL)


def track(api_key: str) -> list[dict]:
    """
    # summary
    지금 진행 중인 태풍의 원본 행. `CACHE_TTL` 안에 다시 물으면 받아 둔 것을 준다.

    ⚠ **던지지 않는다.** 기상청이 죽으면 빈 목록이다 — 부르는 쪽 셋이 전부
      "태풍 없음" 으로 다루면 되는 자리이고, 예외로 올리면 화면이 죽는다.
      (`_fetch_typhoon_forecast` 가 이미 그렇게 감싸고 있었다)

    ⚠ **돌려주는 목록을 고치지 말 것. 받아 둔 그 객체다.** 한 번 고치면 그 뒤의
      모든 호출자가 고쳐진 것을 본다. 베껴 주지 않는 까닭은 지금 읽는 쪽 셋이
      모두 읽기만 하기 때문이다(`split_track` 은 새 목록을 만든다).

    # params
    api_key: 기상청 API 키. 빈 값이면 부르지 않고 빈 목록<br>

    # returns
    `fetch_typhoon_track` 이 주는 dict 목록. 없거나 못 받으면 빈 목록

    # examples
        rows = track(KMA_API_KEY)
        past, forecast = split_track(rows)
    """
    if not api_key:
        return []

    global _entry
    now = datetime.now(timezone.utc)

    with _lock:
        있던것 = _entry
    if 있던것 is not None and _is_fresh(있던것, now):
        return 있던것.rows

    try:
        rows = list(fetch_typhoon_track(api_key))
        failed = False
    except Exception:  # noqa: BLE001 — 외부 API 장애. 태풍 없음으로 다룬다
        rows, failed = [], True

    with _lock:
        _entry = _Entry(rows=rows, made_at=now, failed=failed)
    return rows


def clear() -> None:
    """캐시를 비운다. 테스트가 쓴다 — 운영 경로에서는 부르지 않는다."""
    global _entry
    with _lock:
        _entry = None
