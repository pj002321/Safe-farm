"""Open-Meteo 예보 응답을 좌표별로 **잠깐** 들고 있는다.

★ 2026-09-19 — 리포트 탭이 열릴 때마다 예보를 새로 받고 있었다.

      build_report_input → fetch_forecast          ← 매번 1.2초
      get_cached_or_generate_report → advices 캐시   ← 하루치 캐시는 그 **뒤**다

  그 1.2초가 사용자 체감에 그대로 닿는다(report.py 의 ⚠ 가 스스로 적어 둔 것이다).
  날씨 탭·위성은 Next 의 Data Cache 가 이미 막고 있는데(`WEATHER_REVALIDATE_SEC`
  1시간 · 위성 6시간) 리포트 호출에는 `revalidateSec` 이 없어 `no-store` 로 나간다.

⚠ **TTL 을 Next 의 날씨 캐시(1시간)와 같은 값으로 둔다.** 같은 예보를 두 곳이 서로
  다른 주기로 들고 있으면, 날씨 탭과 리포트가 **다른 날씨를 말하는 구간**이 생긴다.

⚠ **DB 에 넣지 않는다.** 예보는 실시간 값이라 적재의 이득이 없고(같은 이유로
  `교안_ET0저장과_속도.md` 가 보류됐다), 여기서 필요한 것은 몇 분짜리 기억이다.
  프로세스가 여럿이면 캐시도 여럿이지만, 그래도 프로세스마다 1/N 로 준다.

⚠ `app/api/weather.py`(날씨 탭)는 **일부러 이걸 안 쓴다.** 그쪽은 Next 가 이미
  좌표별로 1시간 캐싱하므로 두 겹이 되고, "지금 이 자리 실황" 이라는 그 파일의
  판단(머리말)을 우리가 뒤에서 뒤집는 꼴이 된다.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from app.domain.kst import kst_today
from pipeline.open_meteo_client import fetch_forecast

#: 얼마나 들고 있나. **Next 의 `WEATHER_REVALIDATE_SEC` 와 같은 값이다** —
#: 어긋나면 날씨 탭과 리포트가 서로 다른 예보를 말하는 구간이 생긴다.
CACHE_TTL = timedelta(hours=1)

#: 좌표를 묶는 소수점 자리. 2자리면 약 1km 로, 예보 격자(~11km)보다 촘촘하다.
#: `plot_tasks._COORD_NDIGITS` 와 같은 값이지만 **여기서 다시 정한다** — 저쪽은
#: 한 배치 안의 메모용이고 이쪽은 요청 사이의 기억이라, 수명이 다른 두 장치다.
COORD_NDIGITS = 2


@dataclass(frozen=True)
class _Entry:
    payload: dict
    made_at: datetime
    #: 담을 때의 한국 날짜. 아래 `_is_fresh` 의 ⚠ 를 볼 것
    made_on: date


_cache: dict[tuple[float, float, int], _Entry] = {}
#: 사전만 지킨다. **네트워크 호출은 절대 이 안에서 하지 않는다** —
#: 잠근 채로 부르면 병렬로 들어온 8갈래가 한 줄로 서서 미리 받기가 무의미해진다.
#:
#: ⚠ 그 대가로 **찬 열쇠에 동시에 들어오면 그 수만큼 받아온다.** 실측으로 8갈래가
#:   같은 좌표를 동시에 물으면 8번 나갔다(결과는 같고, 마지막 것만 남는다).
#:   한 번만 받게 하려면 열쇠마다 잠금을 두어야 하는데, 그러면 위의 ⚠ 를 어긴다.
#:   지금 이대로 두는 까닭은 **실제로 겹칠 일이 없어서**다 —
#:   배치는 `plot_tasks._prefetch_weather` 가 열쇠를 미리 합쳐 한 번씩만 부르고,
#:   화면은 사용자마다 좌표가 다르다. 겹쳐도 몇 회 더 나갈 뿐 값은 옳다.
_lock = threading.Lock()


def _is_fresh(entry: _Entry, now: datetime, today: date) -> bool:
    """아직 쓸 수 있나.

    ⚠ **TTL 만으로는 모자라다. 한국 날짜가 같아야 한다.**
      응답을 받을 때 "오늘" 을 정해 `tomorrow`·과거 14일 창을 잘라 둔다
      (`plot_tasks._fetch_plot_weather`). 자정을 넘겨 그대로 쓰면 `tomorrow` 가
      사실은 **오늘**이 되어, 서리·폭염 카드가 하루 어긋난 예보로 나간다.
      할 일 배치가 **00시(KST)에 돈다** — 23:30 에 담은 것이 TTL 안에 살아 있다.
    """
    return now - entry.made_at < CACHE_TTL and entry.made_on == today


def _sweep(now: datetime, today: date) -> None:
    """지난 것을 버린다. 쓰기 때마다 한 번 — 좌표가 늘어도 사전이 안 불어난다."""
    for 열쇠 in [k for k, v in _cache.items() if not _is_fresh(v, now, today)]:
        _cache.pop(열쇠, None)


def forecast(lat: float, lon: float, past_days: int = 0) -> dict:
    """
    # summary
    `fetch_forecast` 와 같은 응답. 같은 좌표를 `CACHE_TTL` 안에 다시 물으면
    받아 둔 것을 준다.

    ⚠ `past_days` 도 열쇠다. 같은 좌표라도 과거를 달라고 한 응답과 아닌 응답은
      배열 길이가 다르고, 짧은 쪽을 긴 쪽 자리에 끼우면 **날짜가 밀린다.**

    ⚠ **돌려주는 dict 를 고치지 말 것. 받아 둔 그 객체다.**
      한 번 고치면 그 뒤의 모든 호출자가 고쳐진 것을 본다 — 다른 밭, 다른 요청까지.
      베껴 주지 않는 까닭은 23KB 짜리를 호출마다 복사하면 아낀 시간을 도로 쓰기
      때문이다. 지금 읽는 쪽(`normalize_daily_forecast`·`hourly_value_at`)은 둘 다
      새 객체를 만들어 돌려주므로 이 약속이 지켜지고 있다(2026-09-19 확인).

    ⚠ 실패는 안 담는다. 외부가 잠깐 죽었을 때 그 사실을 한 시간 붙들면,
      복구된 뒤에도 카드가 계속 얇게 나간다. 예외는 그대로 올려보낸다 —
      부르는 쪽이 이미 받아 낼 채비가 되어 있다(`_fetch_plot_weather` 의 try).

    # params
    lat: 위도<br>
    lon: 경도<br>
    past_days: 함께 받을 과거 날수. 0 이면 예보만<br>

    # returns
    Open-Meteo 응답 그대로(dict)

    # examples
        forecast(36.41, 128.16, past_days=14)["daily"]["time"][0]  -> '2026-09-05'
    """
    열쇠 = (round(lat, COORD_NDIGITS), round(lon, COORD_NDIGITS), past_days)
    now, today = datetime.now(timezone.utc), kst_today()

    with _lock:
        있던것 = _cache.get(열쇠)
    if 있던것 is not None and _is_fresh(있던것, now, today):
        return 있던것.payload

    payload = fetch_forecast(lat, lon, past_days=past_days)

    with _lock:
        _sweep(now, today)
        _cache[열쇠] = _Entry(payload=payload, made_at=now, made_on=today)
    return payload


def clear() -> None:
    """캐시를 비운다. 테스트가 쓴다 — 운영 경로에서는 부르지 않는다."""
    with _lock:
        _cache.clear()
