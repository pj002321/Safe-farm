"""질문이 물어본 것만 밭 컨텍스트에 덧붙인다.

★ 2026-09-19 — 위성·병해충·재해 자료가 DB 에 다 있는데 질문답변만 못 쓰고
  있었다. 리포트·카드는 이미 쓴다(report.py · task_rules.py).

⚠ **무조건 싣지 않는다.** "웃거름 언제 줘요?" 에 병해충 목록이 따라붙으면 LLM 이
  그걸 답에 녹이려다 물어본 것이 흐려진다. `ask_topics.topics_in` 이 질문을 보고
  갈래를 고르고, 아무것도 안 걸리면 **아무것도 안 붙는다**.

⚠ 여기서 새 판단을 만들지 않는다. 문장은 전부 이미 있는 것을 부른다 —
  위성은 `vegetation_text`, 병해충은 `pest_notes`, 재해는 `disaster_notes`.
  같은 밭을 두고 리포트와 질문답변이 다른 말을 하면 안 된다.
"""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

from app.domain.ask_topics import topics_in
from app.domain.gdd import past_target
from app.domain.vegetation_text import summarize_points, vegetation_lines
from app.models.farm import Plot
from app.service.disaster_notes import prevention_notes_for
from app.service.pest_notes import pest_names_for
from app.service.plot_growth import PlotGrowth, compute_plot_growth, nearest_station
from app.service.satellite_cache import READ_DAYS, stored_observations


def _satellite_line(db: Session, plot: Plot, growth: PlotGrowth) -> str | None:
    """위성이 본 것 한 줄. 관측이 없으면 None.

    ⚠ **표에 있는 것만 본다.** 질문은 캐시가 없어 물어볼 때마다 도는 길이다 —
      여기서 밖에 물으면 질문 한 번에 1.5초가 붙는다. 표를 채우는 일은 사람이
      날씨 화면을 열 때 일어난다(satellite_cache).

    ⚠ **리포트와 같은 근거로 익는 중인지 가른다.** 단계 이름만 보면 단계표를
      지난 밭(stage_name 이 None)이 영영 '자라는 중' 이 되어, 추수 앞둔 논에
      "물기가 줄었어요" 가 나간다 — report.py 에서 겪고 고친 그대로다.
    """
    points = stored_observations(db, float(plot.latitude), float(plot.longitude), READ_DAYS)
    말 = vegetation_lines(
        summarize_points(points),
        growth.stage_name,
        is_last_stage=growth.is_last_stage,
        stage_count=growth.stage_count,
        past_gdd_target=past_target(growth.accumulated_gdd, growth.gdd_target),
    )
    if not 말:
        return None
    본날 = points[-1]["date"] if points else None
    return f"위성이 본 것({본날} 관측): {' '.join(말)}"


def extra_context_lines(
    db: Session, plot: Plot, *, question: str | None, today: date | None = None
) -> list[str]:
    """질문이 물어본 갈래만 한 줄씩. 아무것도 안 걸리면 빈 목록이다.

    ⚠ 작물·단계를 **부르는 쪽에서 받지 않고 여기서 낸다**(`compute_plot_growth`).
      리포트·카드가 보는 것과 같은 값이라야 같은 밭에 같은 말이 나간다. 넘겨받으면
      부르는 쪽마다 조금씩 다른 값을 줄 수 있다.

    ⚠ 조회 실패가 답변을 막지 않는다. 덧붙이는 말이 없을 뿐이고, 밭 컨텍스트의
      나머지(작물·단계·기상)는 그대로 나간다.
    """
    갈래 = topics_in(question)
    if not 갈래:
        return []

    오늘 = today or date.today()
    lines: list[str] = []
    try:
        station = nearest_station(db, plot)
        growth = compute_plot_growth(db, plot, station) if station else None
        if growth is None:
            return []
        작물 = growth.crop_name_ko

        if "satellite" in 갈래:
            줄 = _satellite_line(db, plot, growth)
            if 줄:
                lines.append(줄)

        if "pest" in 갈래:
            이름 = pest_names_for(db, 작물, 오늘)
            if 이름:
                lines.append(
                    f"이맘때 {작물}에 자주 나오는 병해충: {'·'.join(이름)}. "
                    "지금 발생 중이라는 뜻은 아니다."
                )

        if "disaster" in 갈래:
            대비 = prevention_notes_for(db, 작물, 오늘.month)
            if 대비:
                lines.append(
                    f"이맘때 미리 해 두는 것: {' / '.join(대비)}. "
                    "지금 그 재해가 온다는 뜻은 아니다."
                )
    except Exception:  # noqa: BLE001 — 덧붙임이 실패해도 답변은 나가야 한다
        logging.warning("[ask] 덧붙일 컨텍스트 조회 실패", exc_info=True)

    return lines
