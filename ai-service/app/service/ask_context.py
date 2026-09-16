"""밭 하나의 최근 상태를 문장 재료로 만든다. `/ask` 가 이 결과를 LLM 프롬프트 앞에
붙여 일반론이 아니라 이 밭 기준으로 답하게 한다.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.domain.gdd import daily_gdd
from app.domain.geo import haversine_km
from app.models.farm import (
    Crop,
    CropStage,
    CropVariant,
    Cultivation,
    Plot,
    Station,
    WeatherObsDaily,
)

RECENT_WEATHER_DAYS = 7


def _nearest_station(db: Session, plot: Plot) -> Station | None:
    """관측소 전체를 훑어 밭과 대권거리가 가장 짧은 곳을 고른다."""
    stations = db.query(Station).all()
    if not stations:
        return None
    return min(
        stations,
        key=lambda s: haversine_km(
            float(plot.latitude), float(plot.longitude), float(s.latitude), float(s.longitude)
        ),
    )


def _start_gdd(db: Session, cultivation: Cultivation) -> float:
    """적산을 시작할 GDD.

    모종으로 시작했으면 0 이 아니다 — 그 모종은 이미 어느 단계까지 자란 상태로
    밭에 들어왔다. start_stage_order 가 가리키는 단계의 gdd_from 부터 쌓는다.
    씨부터면 start_stage_order 가 비어 있고 0 에서 시작한다.
    """
    if cultivation.start_stage_order is None:
        return 0.0
    stage = (
        db.query(CropStage)
        .filter(
            CropStage.variant_id == cultivation.variant_id,
            CropStage.stage_order == cultivation.start_stage_order,
        )
        .first()
    )
    return float(stage.gdd_from) if stage is not None else 0.0


def _growth_stage_lines(
    db: Session, cultivation: Cultivation, crop: Crop, station: Station
) -> list[str]:
    """파종일부터 오늘까지 GDD 를 누적해 현재 생육단계 문장을 만든다.

    파종일을 모르면 빈 리스트다 — 언제부터 쌓을지가 없으면 누적이 성립하지 않는다.
    그 품종의 단계표(crop_stages)가 비어 있을 때도 마찬가지다.
    """
    if cultivation.sowing_date is None:
        return []

    obs = (
        db.query(WeatherObsDaily)
        .filter(
            WeatherObsDaily.station_code == station.station_code,
            WeatherObsDaily.obs_date >= cultivation.sowing_date,
        )
        .all()
    )
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    accumulated = _start_gdd(db, cultivation) + sum(
        daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper)
        for o in obs
        if o.temp_max is not None and o.temp_min is not None
    )

    stage = (
        db.query(CropStage)
        .filter(
            CropStage.variant_id == cultivation.variant_id,
            CropStage.gdd_from <= accumulated,
            CropStage.gdd_to > accumulated,
        )
        .first()
    )
    if stage is None:
        return []
    lines = [f"{crop.name}의 현재 생육단계는 {stage.stage_name}이다."]
    if stage.guide_text:
        lines.append(stage.guide_text)
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


def _growing(db: Session, plot_id: uuid.UUID) -> list[tuple[Cultivation, Crop]]:
    """지금 기르고 있는 재배 건과 그 작물.

    수확·실패한 건과 아직 안 심은 건(PLANNED)은 뺀다 — "지금 뭘 해야 하나"에
    답하는 자리라 이미 끝났거나 시작 안 한 작물은 답을 흐린다.

    cultivations 는 작물이 아니라 품종을 참조하므로 crops 까지 두 번 탄다.
    """
    return (
        db.query(Cultivation, Crop)
        .join(CropVariant, CropVariant.variant_id == Cultivation.variant_id)
        .join(Crop, Crop.crop_id == CropVariant.crop_id)
        .filter(Cultivation.plot_id == plot_id, Cultivation.status == "GROWING")
        .all()
    )


def _lead(rows: list[tuple[Cultivation, Crop]]) -> tuple[Cultivation, Crop]:
    """밭을 대표하는 재배 한 건.

    가장 먼저 심은 것을 고른다 — 화면의 D+n 과 같은 기준이다
    (features/plots/domain/plotSummary.ts 의 leadCultivation). 파종일을 모르는
    건은 대표로 삼지 않는다. 그 건으로는 GDD 를 못 내기 때문이다.
    """
    dated = [row for row in rows if row[0].sowing_date is not None]
    if not dated:
        return rows[0]
    return min(dated, key=lambda row: row[0].sowing_date)


def build_plot_context(db: Session, plot_id: uuid.UUID) -> str | None:
    """밭 하나를 조회해 LLM 프롬프트에 붙일 한글 문장을 만든다. 밭이 없거나 기르는
    작물이 없으면 None — 이때 /ask 는 컨텍스트 없이 예전처럼 답한다."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if plot is None:
        return None

    growing = _growing(db, plot.id)
    if not growing:
        return None

    # 심은 것은 전부 말한다. 생육단계는 대표 한 건으로만 낸다 — 작물마다 파종일도
    # 목표 GDD 도 달라서 한 문장으로 합칠 수 없다.
    crop_names = " · ".join(crop.name for _, crop in growing)
    lines = [f"이 밭은 {plot.region_ko}에 있고 {crop_names}를 재배 중이다."]

    station = _nearest_station(db, plot)
    if station is None:
        return " ".join(lines)

    cultivation, crop = _lead(growing)
    lines += _growth_stage_lines(db, cultivation, crop, station)

    weather_line = _recent_weather_line(db, station)
    if weather_line:
        lines.append(weather_line)

    return " ".join(lines)
