"""배치·데이터 신선도 판정.

cron 의 "succeeded" 는 **HTTP 요청을 큐에 넣었다**는 뜻일 뿐이다(pg_net 은 비동기).
실제 결과는 `net._http_response` 에 따로 남는다. 그래서 실행 결과와 별개로
"데이터가 실제로 새로 들어왔는가"를 표마다 최신 시각으로 본다 — 둘이 어긋나면 그게 사고다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class Feed:
    key: str
    label: str
    loader: str
    latest: datetime | None
    # None 이면 주기가 없는 데이터(요청 때 받는 캐시 등)라 판정하지 않는다.
    max_age_hours: int | None


def is_stale(feed: Feed, now: datetime) -> bool | None:
    if feed.max_age_hours is None:
        return None
    return feed.latest is None or now - feed.latest > timedelta(hours=feed.max_age_hours)


def job_of(content: str | None) -> str | None:
    """`/api/cron/[job]` 응답 본문의 job 이름. JSON 이 아니면(게이트웨이 HTML 등) None."""
    try:
        data = json.loads(content or "")
    except ValueError:
        return None
    return data.get("job") if isinstance(data, dict) else None
