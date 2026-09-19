"""before/after 비교용 측정 장치. `MEASURE=1` 일 때만 붙는다.

기능이 아니다. 최적화 전(`metric_ai_service/before`)과 후(`metric_ai_service/after`)를
**같은 자로** 재려고 넣었고, 비교가 끝나면 남길 것만 골라 옮긴다.

그래서 기존 파일을 거의 안 고친다. 계측은 전부 여기서 monkeypatch 로 하고,
바깥에 남는 건 `install()` 과 요청·노드 경계 표시뿐이다. 두 브랜치의 같은 자리에
같은 줄만 들어가므로 나중에 머지할 때 충돌하지 않는다.

재는 것:

| 값 | 방법 |
|---|---|
| DB 쿼리 수 | SQLAlchemy `before_cursor_execute` 이벤트 |
| 외부 HTTP 호출 수 | `requests.Session.request` 를 감싸 호스트별로 센다 |
| LLM 호출 수·입출력 토큰·캐시 적중 | `chat.completions.create` 를 감싼다 |
| 임베딩 호출 수 | `embeddings.create` 를 감싼다 |
| 노드별 누적 시간 | `mark_node()` (그래프 updates 이벤트에서 부른다) |
| 첫 글자까지 시간 | `mark_first_token()` (SSE 첫 토큰에서 부른다) |
| 전체 시간 | `start()` ~ `finish()` |

**왜 LangGraph state 가 아니라 monkeypatch 인가.** state 로는 셋을 못 잰다 —
예보 캐시가 걸린 `/v1/weather/plot` 은 그래프를 아예 안 타고, DB 쿼리와 임베딩
호출은 노드가 아니라 그 아래 repo·knowledge 층에서 난다. 노드 코드를 고치면
두 브랜치의 같은 파일이 갈라져 머지도 어려워진다.

⚠ **한 번에 요청 하나만 보낸다.** 카운터가 전역이라 동시 요청이 섞인다.
  `ContextVar` 로 나누지 않은 이유는 최적화 후 그래프가 노드를 **스레드 풀**에
  올리기 때문이다 — contextvar 는 그 스레드로 따라가지 않아 오히려 `retrieve` 의
  DB 쿼리가 통째로 누락된다. 측정은 순차로 돌리면 되는 일이라 전역이 더 정확하다.

⚠ **OpenAI 스트림을 제너레이터로 바꾸지 않는다.** usage 를 받으려면
  `stream_options={"include_usage": True}` 가 필요하고, 그러면 `choices` 가 빈
  청크가 마지막에 하나 더 온다. 그대로 흘리면 부르는 쪽의 `chunk.choices[0]` 가
  답변을 다 보낸 뒤 IndexError 로 죽는다(`knowledge/generator.py`).

  그렇다고 `yield` 하는 함수로 감싸면 openai 의 `Stream` 이 평범한 제너레이터가
  되어 `.close()` 와 `with` 가 사라진다. 중간에 버려진 스트림이 HTTP 커넥션을
  안 놓는다. 그래서 `_CountedStream` 이 **원본을 들고 위임한다** — 걸러내는 건
  `__iter__` 뿐이고 나머지는 그대로 통과시킨다.

`MEASURE` 가 꺼져 있으면 import 만 되고 아무것도 감싸지 않는다 — 운영 경로에
남아도 동작이 바뀌지 않게 하려는 것이다.
"""

from __future__ import annotations

import csv
import logging
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from app.core.config import BASE_DIR

#: 켜는 스위치. 값이 없거나 `0`·`false` 면 꺼진 것으로 친다.
ENABLED = os.getenv("MEASURE", "").strip().lower() not in ("", "0", "false")

#: 결과 CSV 가 쌓이는 곳. 파일은 `measure_2026-09-20_14.csv` 처럼 시각으로 이름 짓는다.
OUT_DIR = Path(os.getenv("MEASURE_DIR", str(BASE_DIR / "logs")))

#: 이 실행이 before 인지 after 인지. 두 브랜치 결과를 한 표에서 갈라 읽는 키다.
TAG = os.getenv("MEASURE_TAG", "unknown")

#: 호스트 → CSV 열. **열을 고정하려고 미리 적어 둔다** — 호스트마다 열을 만들면
#: 실행에 따라 헤더가 달라져서 두 파일을 한 표로 못 합친다. 여기 없는 호스트는
#: `http_other` 로 몰되 이름을 잃지 않게 `http_other_hosts` 에 남긴다.
HTTP_COLUMNS = {
    "api.open-meteo.com": "http_open_meteo",
    "apihub.kma.go.kr": "http_kma",
    "sh.dataspace.copernicus.eu": "http_sentinel",
    "identity.dataspace.copernicus.eu": "http_sentinel",
}

#: 시간을 따로 뽑을 노드. ask 그래프의 네 개다 — 병렬화(plan ∥ retrieve) 효과가
#: 여기서 보인다. 여기 없는 노드는 `nodes_other` 에 `이름:ms` 로 붙는다.
NODE_COLUMNS = ("plan", "run_tools", "retrieve", "generate")

#: CSV 헤더. **순서를 바꾸거나 열을 지우지 않는다** — 이미 쌓인 파일과 안 맞는다.
FIELDS = (
    "ts",
    "tag",
    "label",
    "total_ms",
    "first_token_ms",
    "db_queries",
    "llm_calls",
    "llm_in",
    "llm_cached",
    "llm_out",
    "embed_calls",
    "http_open_meteo",
    "http_kma",
    "http_sentinel",
    "http_other",
    "http_other_hosts",
    *(f"node_{name}_ms" for name in NODE_COLUMNS),
    "nodes_other",
)

_lock = threading.Lock()
_current: dict[str, Any] | None = None
_installed = False


def _blank(label: str) -> dict[str, Any]:
    return {
        "tag": TAG,
        "label": label,
        "_t0": time.perf_counter(),
        "first_token_ms": None,
        "db_queries": 0,
        "http": {},
        "nodes": {},
        "llm_calls": 0,
        "llm_in": 0,
        "llm_cached": 0,
        "llm_out": 0,
        "embed_calls": 0,
    }


def start(label: str) -> None:
    """
    # summary
    측정 한 건을 연다. 직전 건이 `finish()` 없이 남아 있으면 버린다 — 측정 실패가
    다음 건에 얹히는 것보다 낫다.

    # params
    label: 무엇을 쟀는지. `POST /v1/ask` 처럼 메서드+경로를 넣는다<br>
    """
    global _current
    if not ENABLED:
        return
    with _lock:
        _current = _blank(label)


def mark_node(name: str) -> None:
    """
    # summary
    노드 하나가 끝난 시각을 남긴다. 요청 시작부터의 경과(ms)다.

    **구간 길이가 아니라 완료 시각이다.** 병렬로 도는 노드는 구간이 겹쳐서 길이를
    더하면 전체 시간을 넘는다. 완료 시각이면 before 는 `plan` 뒤에 `retrieve` 가
    오고 after 는 둘이 비슷하게 찍히는 게 그대로 보인다.

    # params
    name: 노드 이름. 그래프의 `add_node` 에 쓴 이름 그대로<br>
    """
    if not ENABLED:
        return
    with _lock:
        if _current is not None:
            _current["nodes"][name] = round((time.perf_counter() - _current["_t0"]) * 1000)


def mark_first_token() -> None:
    """
    # summary
    첫 글자가 나간 시각을 남긴다. 두 번째부터는 무시한다 — 첫 번째만 의미가 있다.
    """
    if not ENABLED:
        return
    with _lock:
        if _current is not None and _current["first_token_ms"] is None:
            _current["first_token_ms"] = round((time.perf_counter() - _current["_t0"]) * 1000)


def finish() -> dict[str, Any] | None:
    """
    # summary
    측정을 닫고 CSV 한 행으로 남긴다.

    # returns
    잰 값. 측정이 열려 있지 않았으면 None
    """
    global _current
    if not ENABLED:
        return None
    with _lock:
        row = _current
        _current = None
    if row is None:
        return None

    row["total_ms"] = round((time.perf_counter() - row.pop("_t0")) * 1000)
    logging.info(
        "[measure] %s %sms (첫글자 %s · 쿼리 %s · 토큰 %s/%s 캐시 %s)",
        row["label"],
        row["total_ms"],
        row["first_token_ms"],
        row["db_queries"],
        row["llm_in"],
        row["llm_out"],
        row["llm_cached"],
    )
    _append(_to_csv_row(row))
    return row


def _to_csv_row(row: dict[str, Any]) -> dict[str, Any]:
    """중첩된 dict(http·nodes)를 고정 열로 편다."""
    http: dict[str, int] = row["http"]
    other_hosts = [h for h in http if h not in HTTP_COLUMNS]

    nodes: dict[str, int] = row["nodes"]
    other_nodes = [n for n in nodes if n not in NODE_COLUMNS]

    flat: dict[str, Any] = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "tag": row["tag"],
        "label": row["label"],
        "total_ms": row["total_ms"],
        "first_token_ms": row["first_token_ms"],
        "db_queries": row["db_queries"],
        "llm_calls": row["llm_calls"],
        "llm_in": row["llm_in"],
        "llm_cached": row["llm_cached"],
        "llm_out": row["llm_out"],
        "embed_calls": row["embed_calls"],
        "http_open_meteo": 0,
        "http_kma": 0,
        "http_sentinel": 0,
        "http_other": sum(http[h] for h in other_hosts),
        "http_other_hosts": "|".join(sorted(other_hosts)),
        "nodes_other": "|".join(f"{n}:{nodes[n]}" for n in sorted(other_nodes)),
    }
    for host, count in http.items():
        column = HTTP_COLUMNS.get(host)
        if column:
            flat[column] += count
    for name in NODE_COLUMNS:
        flat[f"node_{name}_ms"] = nodes.get(name)
    return flat


def _append(flat: dict[str, Any]) -> None:
    """지금 시각의 CSV 에 한 행 붙인다. 파일이 새것이면 헤더부터 쓴다.

    시각으로 이름을 지으면 **이름을 바꿀 일이 없어** 여러 프로세스가 붙어도 되고
    재시작해도 그 시간대 파일로 알아서 돌아간다(`TimedRotatingFileHandler` 는
    열린 파일 이름을 바꿔서 Windows 에서 터진다).

    측정 파일은 지우지 않는다. 앱 로그와 달리 이게 결과물이다.
    """
    path = OUT_DIR / f"measure_{datetime.now():%Y-%m-%d_%H}.csv"
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        is_new = not path.exists() or path.stat().st_size == 0
        # newline="" 은 csv 모듈의 요구다. 빼면 Windows 에서 빈 줄이 하나씩 낀다.
        with path.open("a", encoding="utf-8-sig", newline="") as fp:
            writer = csv.DictWriter(fp, fieldnames=FIELDS)
            if is_new:
                writer.writeheader()
            writer.writerow(flat)
    except OSError as exc:  # noqa: BLE001 — 측정 때문에 요청을 죽이지 않는다
        logging.warning("[measure] 기록 실패: %s", exc)


def _bump(key: str, amount: int = 1) -> None:
    with _lock:
        if _current is not None:
            _current[key] += amount


def _bump_host(host: str) -> None:
    with _lock:
        if _current is not None:
            _current["http"][host] = _current["http"].get(host, 0) + 1


def _record_usage(usage: Any) -> None:
    """usage 객체는 스트리밍이냐 아니냐로 오는 자리가 다르지만 필드 이름은 같다."""
    if usage is None:
        return
    details = getattr(usage, "prompt_tokens_details", None)
    cached = getattr(details, "cached_tokens", 0) or 0
    with _lock:
        if _current is None:
            return
        _current["llm_in"] += getattr(usage, "prompt_tokens", 0) or 0
        _current["llm_out"] += getattr(usage, "completion_tokens", 0) or 0
        _current["llm_cached"] += cached


def install() -> None:
    """
    # summary
    계측을 붙인다. 앱 기동 때 한 번만 부른다. `MEASURE` 가 꺼져 있으면 아무것도
    하지 않는다.
    """
    global _installed
    if not ENABLED or _installed:
        return
    _installed = True
    _patch_sqlalchemy()
    _patch_requests()
    _patch_openai()
    logging.info("[measure] 계측 시작 — tag=%s dir=%s", TAG, OUT_DIR)


def _patch_sqlalchemy() -> None:
    """엔진 클래스에 걸어 둔다. 엔진을 언제 만들든(지연 생성) 그 뒤에 붙는다."""
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    @event.listens_for(Engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        _bump("db_queries")


def _patch_requests() -> None:
    """`Session.request` 하나만 감싼다.

    `requests.get` 도 안에서 이걸 부르므로 여기만 걸면 전부 잡히고, 둘 다 감싸면
    한 번의 호출이 두 번으로 세어진다. OpenAI 는 httpx 를 쓰므로 여기 안 걸린다 —
    그쪽은 `llm_calls` 로 따로 센다.
    """
    import requests

    original = requests.Session.request

    def counted(self, method, url, *args, **kwargs):  # noqa: ANN001
        _bump_host(urlsplit(str(url)).netloc or "?")
        return original(self, method, url, *args, **kwargs)

    requests.Session.request = counted


class _CountedStream:
    """openai `Stream` 을 감싸 usage 청크만 걷어낸다. 나머지는 원본에 위임한다.

    제너레이터로 바꾸지 않는 이유는 모듈 독스트링의 두 번째 ⚠ 참고 — `.close()`
    와 `with` 가 살아 있어야 버려진 스트림이 커넥션을 놓는다.
    """

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    def __iter__(self):
        for chunk in self._inner:
            usage = getattr(chunk, "usage", None)
            if usage is not None:
                _record_usage(usage)
            # `include_usage` 를 켜면 마지막에 choices 가 빈 청크가 온다.
            # 부르는 쪽이 `chunk.choices[0]` 를 까므로 여기서 끊는다.
            if not getattr(chunk, "choices", None):
                continue
            yield chunk

    def __enter__(self):
        self._inner.__enter__()
        return self

    def __exit__(self, *args: Any) -> Any:
        return self._inner.__exit__(*args)

    def __getattr__(self, name: str) -> Any:
        # close·response·http_response 등 우리가 모르는 것도 원본이 받는다.
        return getattr(self._inner, name)


def _patch_openai() -> None:
    """채팅·임베딩 두 진입점을 감싼다. 두 브랜치 모두 `get_client()` 를 거쳐 여기로 온다."""
    from openai.resources import embeddings as embeddings_module
    from openai.resources.chat import completions as completions_module

    chat_original = completions_module.Completions.create

    def chat_counted(self, *args, **kwargs):  # noqa: ANN001
        # usage 를 받으려면 켜야 한다. 부르는 쪽이 이미 켰으면 건드리지 않는다.
        if kwargs.get("stream") and "stream_options" not in kwargs:
            kwargs["stream_options"] = {"include_usage": True}
        _bump("llm_calls")
        result = chat_original(self, *args, **kwargs)
        if not kwargs.get("stream"):
            _record_usage(getattr(result, "usage", None))
            return result
        return _CountedStream(result)

    completions_module.Completions.create = chat_counted

    embed_original = embeddings_module.Embeddings.create

    def embed_counted(self, *args, **kwargs):  # noqa: ANN001
        _bump("embed_calls")
        return embed_original(self, *args, **kwargs)

    embeddings_module.Embeddings.create = embed_counted
