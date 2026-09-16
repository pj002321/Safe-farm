"""밭 하나의 최근 상태를 문장 재료로 만든다. `/ask` 가 이 결과를 LLM 프롬프트 앞에
붙여 일반론이 아니라 이 밭 기준으로 답하게 한다.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.farm import Plot, Station, WeatherObsDaily
from app.service.plot_growth import CROP_ID_TO_NAME_KO, PlotGrowth, compute_plot_growth, nearest_station

RECENT_WEATHER_DAYS = 7


def _growth_stage_lines(growth: PlotGrowth | None) -> list[str]:
    """계산된 생육 상태를 문장 두 줄(단계명 + 안내문)로 조립한다. 계산 자체는
    app/service/plot_growth.py 가 한다 — 여긴 LLM 프롬프트용 문장 포맷팅만 한다."""
    if growth is None or growth.stage_name is None:
        return []
    lines = [f"현재 생육단계는 {growth.stage_name}이다."]
    if growth.guide_text:
        lines.append(growth.guide_text)
    return lines


def _recent_weather_line(db: Session, station: Station) -> str | None:
    """최근 며칠 평균 최고기온 한 줄. 관측이 없으면 None."""
    recent = (
        db.query(WeatherObsDaily)
        .filter(WeatherObsDaily.station_code == station.station_code)
        .order_by(WeatherObsDaily.obs_date.desc())
        .limit(RECENT_WEATHER_DAYS)
        .all()
    )
    temps = [float(o.temp_max) for o in recent if o.temp_max is not None]
    if not temps:
        return None
    return f"최근 {len(temps)}일 평균 최고기온은 {sum(temps) / len(temps):.1f}도다."


def build_plot_context(db: Session, plot_id: uuid.UUID) -> str | None:
    """밭 하나를 조회해 LLM 프롬프트에 붙일 한글 문장을 만든다. 밭이 없거나 작물이
    안 정해졌으면 None — 이때 /ask 는 컨텍스트 없이 예전처럼 답한다."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if plot is None or not plot.crops:
        return None

    crop_name_ko = CROP_ID_TO_NAME_KO.get(plot.crops[0])
    lines = [f"이 밭은 {plot.region_ko}에 있고 {crop_name_ko or plot.crops[0]}를 재배 중이다."]

    station = nearest_station(db, plot)
    if station is None:
        return " ".join(lines)

    lines += _growth_stage_lines(compute_plot_growth(db, plot, station))

    weather_line = _recent_weather_line(db, station)
    if weather_line:
        lines.append(weather_line)

    return " ".join(lines)