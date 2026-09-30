"""밭 조회. **쿼리만 한다 — 판단은 부르는 쪽이 한다.**

여기 모으는 이유는 중복이 아니라 **조건이 갈리는 것**이었다. 같은 "내 밭" 조회가
`service/ask_context.py` · `api/reports.py` 에 글자까지 같은 두 벌로 있었고,
`deleted_at is null` 을 손으로 적는 자리가 다섯 군데였다. 한 곳만 빠뜨리면 지운
밭이 새는데 화면에는 안 보여서 늦게 발견된다 — `service/plot_tasks.py` 에서 실제로
그 버그가 났다.

⚠ **soft delete 조건은 이 파일 밖에 적지 않는다.** 새 조회가 필요하면 여기에
  함수를 늘린다. `db.query(Plot)` 을 다른 층에서 직접 부르면 그 조건이 또 갈린다.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.farm import Plot


def owned_plot(db: Session, plot_id: uuid.UUID, user_id: uuid.UUID) -> Plot | None:
    """
    # summary
    이 사용자의 살아 있는 밭 하나. 남의 밭이거나 지운 밭이면 None.

    **소유 확인이 여기서 끝난다.** plot_id 는 브라우저가 보낸 값이고, ai-service 는
    `postgres` 로 붙어 RLS 를 타지 않는다 — 거르지 않으면 남의 밭 id 하나로 그 밭의
    지역·작물·생육단계를 답변으로 되받을 수 있다. Next 화면이 자기 밭만 고르게 해
    두지만 그건 화면의 일이고, `/api/ai/ask` 는 직접 POST 할 수 있다.

    # params
    db: 세션<br>
    plot_id: 호출자가 보낸 밭 id. 믿지 않는다<br>
    user_id: Next 가 세션 쿠키로 확인해 실어 보낸 값<br>

    # returns
    Plot 또는 None. **없는 밭과 남의 밭을 구분하지 않는다** — 구분해 알리는 순간
    "그 id 의 밭이 있다"는 사실이 새어 나간다. 부르는 쪽도 한 가지 이유로만 답한다

    # examples
        owned_plot(db, 남의_밭_id, 내_id)  -> None
    """
    return db.scalars(
        select(Plot).where(
            Plot.id == plot_id,
            Plot.user_id == user_id,
            Plot.deleted_at.is_(None),
        )
    ).first()


def live_plot(db: Session, plot_id: uuid.UUID) -> Plot | None:
    """
    # summary
    살아 있는 밭 하나. **소유는 보지 않는다.**

    ⚠ 사용자 요청 경로에서 쓰지 말 것. 이건 배치·내부 호출용이다. 사용자가 부른
      길이면 `owned_plot` 을 쓴다 — user_id 를 빼먹으면 남의 밭이 그대로 열린다.

    # params
    db: 세션<br>
    plot_id: 밭 id<br>

    # returns
    Plot 또는 None. 지운 밭은 없는 밭과 같이 None 이다 — soft delete 라 행은 남아
    있어서 `db.get()` 으로는 그대로 잡힌다. 그대로 두면 숨긴 밭에 `plot_tasks` 가
    쌓이고 그 카드를 지우는 화면이 없다

    # examples
        live_plot(db, 지운_밭_id)  -> None
    """
    return db.scalars(
        select(Plot).where(Plot.id == plot_id, Plot.deleted_at.is_(None))
    ).first()


def plots_of_user(db: Session, user_id: uuid.UUID) -> list[Plot]:
    """
    # summary
    이 사용자의 살아 있는 밭 전부.

    # params
    db: 세션<br>
    user_id: 사용자 id<br>

    # returns
    Plot 목록. 순서를 정하지 않는다 — 부르는 쪽이 밭마다 같은 처리를 돌릴 뿐이라
    차례가 결과를 바꾸지 않는다. 비면 밭을 아직 안 만든 사용자다

    # examples
        len(plots_of_user(db, user_id))  -> 3
    """
    return list(
        db.scalars(
            select(Plot).where(Plot.user_id == user_id, Plot.deleted_at.is_(None))
        )
    )


def count_plots_of_user(db: Session, user_id: uuid.UUID) -> int:
    """
    # summary
    이 사용자의 살아 있는 밭 수.

    밭이 하나도 없는 것과 밭은 있는데 생육 근거가 없는 것은 화면에서 다른 문구라,
    무거운 조회를 돌리기 전에 이걸로 먼저 가른다.

    # params
    db: 세션<br>
    user_id: 사용자 id<br>

    # returns
    개수. 0 이면 밭을 아직 안 만든 사용자다

    # examples
        count_plots_of_user(db, 새로_가입한_id)  -> 0
    """
    return (
        db.scalar(
            select(func.count())
            .select_from(Plot)
            .where(Plot.user_id == user_id, Plot.deleted_at.is_(None))
        )
        or 0
    )


def all_live_plots(db: Session) -> list[Plot]:
    """
    # summary
    지우지 않은 밭 전부. 매일 도는 배치의 대상 목록이다.

    ⚠ 사용자 전체의 밭이다. 사용자 요청 경로에서 부를 일이 없다.

    # params
    db: 세션<br>

    # returns
    Plot 목록. 거르지 않으면 지운 밭에 매일 카드가 새로 쌓인다 — 화면에서는
    Next 쪽 조인 조건(`taskStore.listTaskCards` 의 `plots.deleted_at is null`)이
    가려 주므로 보이지 않고, 그래서 더 늦게 발견된다

    # examples
        len(all_live_plots(db))  -> 12
    """
    return list(db.scalars(select(Plot).where(Plot.deleted_at.is_(None))))


def last_activity_of_user(db: Session, user_id: uuid.UUID) -> datetime | None:
    """
    # summary
    이 사용자가 **스스로 한** 마지막 일의 시각 — 밭 등록·질문·영농일지·할 일 완료.

    화면을 연 것은 세지 않는다(접속 기록 표가 없다). 그래서 "오랜만에 왔다"는
    "오랫동안 아무것도 안 했다"로 판정한다. 관리자 위험 회원 리포트
    (`repo/admin.last_activity_by_user`)와 같은 기준이다 — 둘이 다르면 관리자가 본
    "N일째 활동 없음"과 사용자가 받는 인사가 어긋난다.
    """
    return db.execute(text("""
        select max(at) from (
            select created_at as at from plots where user_id = :uid and deleted_at is null
            union all
            select created_at from ask_history where user_id = :uid
            union all
            select e.created_at from cultivation_events e
                join cultivations c on c.id = e.cultivation_id
                join plots p on p.id = c.plot_id where p.user_id = :uid
            union all
            select t.done_at from plot_tasks t
                join plots p on p.id = t.plot_id where p.user_id = :uid and t.done
        ) a
    """), {"uid": user_id}).scalar()
