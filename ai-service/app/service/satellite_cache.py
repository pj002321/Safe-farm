"""위성 관측을 **표에 담아 두고 거기서 읽는다.** 없거나 낡았을 때만 밖에 묻는다.

    부르는 쪽 ─▶ 표에 있나? ─예─▶ 그대로 (수 ms)
                      └─아니오─▶ Sentinel Hub 1회 ─▶ 표에 넣고 돌려준다 (1.5초)

`weather_obs_daily` 와 같은 구조다 — 밖에 묻는 일과 화면에 그리는 일을 가른다.
기온·강수는 이미 그렇게 돌고 있었고 위성만 볼 때마다 밖에 물었다. 그런데 이 값은
구름과 재방문 주기 때문에 **평균 18일에 한 번**밖에 안 바뀐다(sentinelhub_client
머리 실측). 날씨 탭·리포트가 각자 물어서 같은 답에 매번 1.5초를 썼다.

⚠ **부르는 쪽의 계약을 바꾸지 않았다.** `app/api/satellite.py` 는 좌표와 날짜
  범위를 받는 API 그대로다 — 안에서 무엇을 부르는지만 바뀌었다. 그래서 이 표도
  밭이 아니라 좌표로 묶는다.

⚠ 배치를 따로 두지 않았다. 처음 보는 좌표는 **그 한 번만** 기다리고 그 뒤로는
  표에서 나온다. 밤 배치로 미리 채우는 것은 나중에 얹을 수 있다(교안 §8).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import SH_CLIENT_ID, SH_CLIENT_SECRET
from app.repo.satellite import (
    fetch_log,
    insert_observations,
    observations_between,
    upsert_fetch_log,
)
from pipeline.sentinelhub_client import fetch_ndvi_ndmi_series

#: 관측을 되돌아보는 창(일). 관측이 평균 18일에 한 번밖에 안 남아서
#: (sentinelhub_client 머리 실측) 좁게 잡으면 점이 아예 없는 밭이 생긴다.
#:
#: ⚠ 화면 쪽 `SATELLITE_WINDOW_DAYS`(weather/page.tsx)와 같은 값이어야 한다.
#:   어긋나면 같은 밭의 차트와 리포트가 서로 다른 구간을 본다.
READ_DAYS = 90

#: 좌표를 반올림할 자리. 4자리는 약 11m 로, Sentinel-2 화소(10m)·조회 폴리곤
#: 반폭(15m)과 같은 눈금이다.
#:
#: ⚠ 이보다 잘게 나누면 같은 밭이 매번 다른 열쇠가 되어 표가 쓸모없어지고,
#:   굵게 잡으면 옆 밭의 값을 우리 밭 것으로 읽는다. plot_tasks 의
#:   `_COORD_NDIGITS = 2`(약 1.1km)는 **예보용**이라 자리가 다르다 — 예보는
#:   동네 단위로 같지만 식생은 밭마다 다르다.
COORD_NDIGITS = 4

#: 이보다 오래 전에 물어봤으면 다시 묻는다.
#:
#: 관측은 18일에 한 번 들어오지만 **언제 들어올지는 모른다.** 반나절이면 새 관측을
#: 하루 안에 줍고, 하루에 두 번보다 자주 부르지 않는다.
CACHE_TTL = timedelta(hours=12)


def _반올림(값: float) -> float:
    return round(float(값), COORD_NDIGITS)


def _points_from(rows) -> list[dict]:
    """표의 행을 화면·프롬프트가 아는 모양으로. Numeric 은 Decimal 이라 float 로 푼다."""
    return [
        {
            "date": r.obs_date.isoformat(),
            "ndvi": float(r.ndvi) if r.ndvi is not None else None,
            "ndmi": float(r.ndmi) if r.ndmi is not None else None,
        }
        for r in rows
    ]


def _cache_is_fresh(db: Session, lat: float, lon: float, date_from: date) -> bool:
    """표에 담긴 것으로 이 요청을 덮을 수 있나.

    둘 다 맞아야 한다 —
      · 물어본 지 얼마 안 됐다            (그 사이 새 관측이 생겼을 수 있다)
      · 받아 둔 구간이 요청만큼 넓다       (더 옛날을 물으면 모자란다)
    """
    log = fetch_log(db, _반올림(lat), _반올림(lon))
    if log is None:
        return False
    if log.covered_from > date_from:
        return False
    return datetime.now(timezone.utc) - log.fetched_at < CACHE_TTL


def _read(db: Session, lat: float, lon: float, date_from: date, date_to: date) -> list[dict]:
    """표에 있는 것만. 날짜 오름차순 — 부르는 쪽이 마지막을 최근으로 읽는다."""
    rows = observations_between(db, _반올림(lat), _반올림(lon), date_from, date_to)
    return _points_from(rows)


def stored_observations(db: Session, lat: float, lon: float, days: int) -> list[dict]:
    """**표에 있는 것만.** 없으면 빈 목록 — 밖에 묻지 않는다.

    ⚠ 밤 배치(plot_tasks)가 쓰라고 연 문이다. 거기서 `observations()` 를 부르면
      밭마다 1.5초가 붙어 50초 한도에 금방 닿는다(plot_tasks 주석). 배치는 표에
      있는 것으로만 판정하고, 표를 채우는 일은 사람이 화면을 열 때 일어난다.
    """
    오늘 = date.today()
    return _read(db, lat, lon, 오늘 - timedelta(days=days), 오늘)


def _store(db: Session, lat: float, lon: float, date_from: date, points: list[dict]) -> None:
    """받아 온 것을 표에 넣고 '언제 물어봤나'를 새로 쓴다.

    ⚠ **이미 있는 날짜는 덮지 않는다**(on conflict do nothing). 지나간 관측은 값이
      바뀌지 않으므로 덮을 이유가 없다.

    ⚠ 관측이 0건이어도 **물어본 기록은 남긴다.** 구름에 가려 한 점도 없는 것이
      흔한 정상이라(최장 공백 32일 실측), 이 기록이 없으면 그런 좌표는 요청마다
      Sentinel Hub 를 다시 부른다.
    """
    lat_r, lon_r = _반올림(lat), _반올림(lon)

    insert_observations(db, lat_r, lon_r, points)
    upsert_fetch_log(db, lat_r, lon_r, date_from, datetime.now(timezone.utc))
    db.commit()


def observations(db: Session, lat: float, lon: float, date_from: str, date_to: str) -> list[dict]:
    """이 좌표의 `date_from`~`date_to` NDVI·NDMI. **표를 먼저 본다.**

    ⚠ 밖에서 받는 데 실패하면 **표에 있는 것이라도 돌려준다.** 위성은 더하는
      신호지 의존하는 신호가 아니라(sentinelhub_client 머리), 어제 값이라도 있는
      편이 빈 화면보다 낫다. 표도 비어 있으면 그때 올린다 — 부르는 쪽이 502 로
      환원한다.
    """
    시작, 끝 = date.fromisoformat(date_from), date.fromisoformat(date_to)

    if _cache_is_fresh(db, lat, lon, 시작):
        return _read(db, lat, lon, 시작, 끝)

    try:
        points = fetch_ndvi_ndmi_series(
            SH_CLIENT_ID, SH_CLIENT_SECRET, lat, lon, date_from, date_to
        )
    except Exception:
        db.rollback()
        담긴것 = _read(db, lat, lon, 시작, 끝)
        if 담긴것:
            logging.warning("[satellite] 조회 실패 — 표에 담긴 것으로 간다", exc_info=True)
            return 담긴것
        raise

    _store(db, lat, lon, 시작, points)
    return _read(db, lat, lon, 시작, 끝)
