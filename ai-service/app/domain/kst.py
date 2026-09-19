"""한국 날짜. **운영 서버가 UTC 라 `date.today()` 를 그냥 쓰면 안 된다.**

예보(Open-Meteo)에 `timezone=Asia/Seoul` 을 주므로 응답 날짜가 KST 다. 서버에서
`date.today()` 를 쓰면 한국 자정 직후 아홉 시간 동안 **어제**가 나와, 예보 배열에서
오늘을 못 찾는다.

★ 2026-09-19 — `plot_tasks` 와 `report` 에 같은 함수가 두 벌 있던 것을 여기로
  모았다. 한쪽만 고치면 카드와 리포트가 서로 다른 날을 본다.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

#: 한국 표준시. 서머타임이 없어 고정 오프셋이지만, 이름으로 두면 읽는 사람이 안다.
KST = ZoneInfo("Asia/Seoul")


def kst_today() -> date:
    """
    # summary
    지금 한국 날짜. 서버 시간대와 무관하게 늘 KST 로 센다.

    # returns
    오늘(KST) `date`

    # examples
        kst_today().isoformat()  -> '2026-09-19'
    """
    return datetime.now(KST).date()
