"""할 일 카드(`farm.plot_tasks`) 조회·쓰기. **쿼리만 한다 — 판정은 service 가 한다.**

이 파일은 다른 repo 와 달리 **쓰기가 있다**(만료 처리). 카드를 만들지 말지는
`domain/task_rules.py` 가 정하고, 여기는 정해진 것을 DB 에 옮길 뿐이다.

⚠ **커밋하지 않는다.** 트랜잭션 경계는 service 가 쥔다 — 만료와 신규 생성이 한
  단위로 끝나야 하는데, repo 가 중간에 커밋하면 만료만 반영되고 생성이 실패하는
  상태가 만들어진다.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.farm import PlotTask


def open_titles(db: Session, plot_id: uuid.UUID) -> set[str]:
    """
    # summary
    이 밭에 **살아 있는** 카드의 제목들. 같은 카드를 다시 만들지 않으려고 쓴다.

    "살아 있다"는 완료(`done`)도 만료(`expired_at`)도 아니라는 뜻이다. 닫힌 카드를
    같이 세면 만료 처리 자체가 무의미해진다 — 한 번 나온 제목은 영영 다시 안 나온다.

    # params
    db: 세션<br>
    plot_id: 밭 id<br>

    # returns
    제목 집합. 제목이 곧 중복 판정 기준이다 — `domain.task_rules` 의 후보 제목이
    고정 문구라서 성립한다. 문구에 날짜·수치를 넣기 시작하면 이 방식이 깨진다

    # examples
        "물주기" in open_titles(db, plot_id)  -> True
    """
    return {
        title
        for (title,) in db.execute(
            select(PlotTask.title).where(
                PlotTask.plot_id == plot_id,
                PlotTask.done.is_(False),
                PlotTask.expired_at.is_(None),
            )
        ).all()
    }


def expire_open_before(db: Session, plot_id: uuid.UUID, cutoff: datetime) -> int:
    """
    # summary
    `cutoff` 보다 먼저 만들어진 미완료 카드를 닫고, 닫은 개수를 돌려준다.

    지우지 않는다 — "안 하고 넘어갔다"는 사실이 이력이다. 이미 닫힌 카드는 다시
    건드리지 않는다(`expired_at is null` 조건).

    # params
    db: 세션<br>
    plot_id: 밭 id<br>
    cutoff: 이 시각보다 먼저 생성된 것이 대상. **날짜 경계로 자른 값을 넘긴다** —
    "지금부터 72시간 전"으로 하면 배치가 도는 시각이 몇 분만 밀려도 경계에 걸친
    카드가 어떤 날은 닫히고 어떤 날은 안 닫힌다(`_expire_cutoff` 참고)<br>

    # returns
    닫은 행 수. **커밋은 부르는 쪽이 한다**

    # examples
        expire_open_before(db, plot_id, 사흘_전_자정)  -> 2
    """
    result = db.execute(
        update(PlotTask)
        .where(
            PlotTask.plot_id == plot_id,
            PlotTask.done.is_(False),
            PlotTask.expired_at.is_(None),
            PlotTask.generated_at < cutoff,
        )
        .values(expired_at=func.now())
    )
    return result.rowcount or 0


def add_task(
    db: Session, plot_id: uuid.UUID, title: str, reason: str, priority: int
) -> PlotTask:
    """
    # summary
    카드 한 장을 넣는다. **flush 도 commit 도 하지 않는다.**

    만들지 말지는 `domain/task_rules.build_task_candidates` 가 이미 정했다 —
    여기서 조건을 다시 보지 않는다.

    # params
    db: 세션<br>
    plot_id: 밭 id<br>
    title: 카드 제목. **중복 판정 기준이라 고정 문구여야 한다**(`open_titles` 참고)<br>
    reason: 왜 이 카드가 나왔는지. 사용자에게 그대로 보인다<br>
    priority: 정렬 순서<br>

    # returns
    아직 DB 에 안 들어간 PlotTask. 부르는 쪽이 커밋한다 — 만료 처리와 한 트랜잭션
    으로 묶여야 한다

    # examples
        add_task(db, plot_id, "물주기", "최근 7일 강수 2mm", 1); db.commit()
    """
    task = PlotTask(plot_id=plot_id, title=title, reason=reason, priority=priority)
    db.add(task)
    return task
