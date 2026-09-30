"""관리자 시스템 상태·오류 로그·외부 API 호출량용 메모리 기록.

`measure.py`(MEASURE=1 일 때만 켜지는 실험 장치)와 달리 **항상 켜져 있고 가볍다** —
요청마다 튜플 하나를 deque 에 넣을 뿐이다.

⚠ ponytail: 프로세스 메모리라 재시작하면 사라지고, 워커가 여러 개면 워커마다 따로 센다.
   재시작을 넘어 24시간 이상 보려면 이 기록을 표에 적재할 것.
⚠ 스트리밍 응답(/v1/ask)의 시간은 **첫 바이트까지**다 — 미들웨어는 본문이 다 나가기 전에 돌아온다.
"""

from __future__ import annotations

import time
import traceback
from collections import deque
from datetime import UTC, datetime
from urllib.parse import urlsplit

STARTED_AT = datetime.now(UTC)

# (시각, 경로, 상태코드, ms)
REQUESTS: deque[tuple[datetime, str, int, float]] = deque(maxlen=20_000)
# (시각, 호스트, 성공 여부)
OUTBOUND: deque[tuple[datetime, str, bool]] = deque(maxlen=20_000)
# (시각, 심각도, 출처, 메시지)
ERRORS: deque[tuple[datetime, str, str, str]] = deque(maxlen=500)


def route_of(request) -> str:  # noqa: ANN001
    # `/v1/admin/members/<uuid>/insight` 가 사람마다 다른 행이 되지 않게 경로 틀로 센다.
    route = request.scope.get("route")
    return f"{request.method} {getattr(route, 'path', request.url.path)}"


def record_request(route: str, status: int, started: float) -> None:
    REQUESTS.append((datetime.now(UTC), route, status, (time.perf_counter() - started) * 1000))


def record_error(source: str, exc: BaseException) -> None:
    last = traceback.extract_tb(exc.__traceback__)[-1:] if exc.__traceback__ else []
    where = f" @ {last[0].filename.rsplit('app', 1)[-1]}:{last[0].lineno}" if last else ""
    ERRORS.append((datetime.now(UTC), "error", source, f"{type(exc).__name__}: {exc}"[:300] + where))


def _count_outbound(url: object, ok: bool) -> None:
    OUTBOUND.append((datetime.now(UTC), urlsplit(str(url)).hostname or "?", ok))
    if not ok:
        ERRORS.append((datetime.now(UTC), "warning", "외부 API", f"{urlsplit(str(url)).hostname} 호출 실패"))


def install() -> None:
    """외부 호출을 센다. requests(KMA·NCPMS 등)와 httpx(OpenAI SDK) 둘 다 감싼다."""
    import httpx
    import requests

    original_request = requests.Session.request

    def counted_request(self, method, url, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003, ANN202
        try:
            response = original_request(self, method, url, *args, **kwargs)
        except Exception:
            _count_outbound(url, False)
            raise
        _count_outbound(url, response.status_code < 400)
        return response

    original_send = httpx.Client.send

    def counted_send(self, request, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003, ANN202
        try:
            response = original_send(self, request, *args, **kwargs)
        except Exception:
            _count_outbound(request.url, False)
            raise
        _count_outbound(request.url, response.status_code < 400)
        return response

    requests.Session.request = counted_request
    httpx.Client.send = counted_send
