"""요청 하나가 사는 동안만 남는 조회 캐시. `repo/` 가 마스터 조회를 감쌀 때 쓴다.

같은 요청 안에서 **같은 인자로 같은 표를 여러 번 읽는** 자리가 있다. 예를 들어
`/v1/weather/plot` 하나는 `usable_crop_of_variant` 를 세 번 부른다 —
`daily_gdd_series` · `crop_interpretation` · `compute_plot_growth` 가 저마다
필요해서 각자 부르기 때문이다. 셋을 한 번으로 합치려면 서비스 세 개의 시그니처를
바꿔야 하는데, 값이 같다는 것만 알면 여기서 끝난다.

왜 프로세스 캐시가 아니라 요청 범위인가:

- 캐시에 담기는 건 ORM 객체다. 세션이 끝나면 detach 되고, 그 뒤 속성을 읽으면
  `DetachedInstanceError` 로 죽는다. **세션보다 오래 사는 캐시에 ORM 객체를 넣지
  않는다.** 세션 밖까지 들고 가야 하면 `repo/station.py` 처럼 값 dataclass 로
  베껴 담는다.
- 저장 자리가 `Session.info` 라, 세션이 닫히면 캐시도 같이 사라진다. 지우는 코드가
  필요 없다는 뜻이다.

⚠ **정적 마스터만 담는다**(`crops` · `crop_variants` · `crop_stages`). 사용자
  데이터를 담으면 같은 요청 안에서 쓰기 뒤의 읽기가 옛 값을 본다. 배치처럼 세션
  하나로 밭 수백 개를 도는 경로에서는 "요청 하나"가 배치 전체라 더 그렇다.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")

_SLOT = "master_cache"


def memo(db: Session, key: tuple, produce: Callable[[], T]) -> T:
    """
    # summary
    `key` 로 한 번 읽은 값을 이 세션이 사는 동안 다시 쓴다. 없으면 `produce()` 를
    불러 채운다.

    `None` 도 캐시한다 — "없더라"를 기억하지 않으면 없는 id 를 물을 때마다 매번
    DB 를 친다. 없는 작물을 가리키는 재배 건이 실제로 있었다.

    # params
    db: 세션. 캐시는 `db.info` 에 붙어 세션과 함께 사라진다<br>
    key: 캐시 키. 부르는 쪽에서 **함수 이름까지 넣는다** — 같은 인자를 쓰는 다른
    조회와 섞이면 엉뚱한 값이 나온다(`("crop_of_variant", 7)`)<br>
    produce: 캐시가 비었을 때 값을 만드는 함수. 인자 없이 부른다<br>

    # returns
    캐시된 값 또는 방금 만든 값

    # examples
        memo(db, ("variant", 7), lambda: db.scalars(...).first())
    """
    cache = db.info.setdefault(_SLOT, {})
    if key not in cache:
        cache[key] = produce()
    return cache[key]


def clear(db: Session) -> None:
    """
    # summary
    이 세션의 캐시를 비운다. 마스터를 다시 심은 직후처럼 **같은 세션에서** 새 값을
    봐야 할 때만 쓴다. 평소에는 부를 일이 없다 — 세션이 닫히면 알아서 사라진다.

    # params
    db: 세션<br>

    # examples
        clear(db)
    """
    db.info.pop(_SLOT, None)
