"""밭 하나의 최근 상태를 문장 재료로 만든다. `/ask` 가 이 결과를 LLM 프롬프트 앞에
붙여 일반론이 아니라 이 밭 기준으로 답하게 한다.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.domain.gdd import daily_gdd
from app.domain.geo import haversine_km
from app.models.farm import Crop, CropStage, CropVariant, Plot, Station, WeatherObsDaily

# Next.js 영문 slug(components/plot/crops.tsx) → ai-service 시드 한글명(crops.csv).
# 단감은 과수라 crops.csv 에 일부러 없다 — 이름만 쓰고 GDD 파트는 건너뛴다.
CROP_ID_TO_NAME_KO = {"cabbage": "배추", "rice": "벼", "persimmon": "단감"}
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


def _growth_stage_lines(db: Session, plot: Plot, crop_name_ko: str, station: Station) -> list[str]:
    """파종일부터 오늘까지 GDD 를 누적해 현재 생육단계 문장을 만든다.

    파종일을 모르거나(sowing_unknown) 그 작물의 GDD 데이터가 없으면(단감 등) 빈 리스트.
    """
    if not plot.sowing_date or plot.sowing_unknown:
        return []
    crop = db.query(Crop).filter(Crop.name == crop_name_ko).first()
    if crop is None:
        return []

    variants = {
        v.maturity_type: v
        for v in db.query(CropVariant).filter(CropVariant.crop_id == crop.crop_id)
    }
    variant = variants.get("MID") or variants.get("EARLY") or variants.get("LATE")
    if variant is None:
        return []

    obs = (
        db.query(WeatherObsDaily)
        .filter(
            WeatherObsDaily.station_code == station.station_code,
            WeatherObsDaily.obs_date >= plot.sowing_date,
        )
        .all()
    )
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    accumulated = sum(
        daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper)
        for o in obs
        if o.temp_max is not None and o.temp_min is not None
    )

    stage = (
        db.query(CropStage)
        .filter(
            CropStage.variant_id == variant.variant_id,
            CropStage.gdd_from <= accumulated,
            CropStage.gdd_to > accumulated,
        )
        .first()
    )
    if stage is None:
        return []
    lines = [f"현재 생육단계는 {stage.stage_name}이다."]
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


def build_plot_context(db: Session, plot_id: uuid.UUID) -> str | None:
    """밭 하나를 조회해 LLM 프롬프트에 붙일 한글 문장을 만든다. 밭이 없거나 작물이
    안 정해졌으면 None — 이때 /ask 는 컨텍스트 없이 예전처럼 답한다."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if plot is None or not plot.crops:
        return None

    crop_name_ko = CROP_ID_TO_NAME_KO.get(plot.crops[0])
    lines = [f"이 밭은 {plot.region_ko}에 있고 {crop_name_ko or plot.crops[0]}를 재배 중이다."]

    station = _nearest_station(db, plot)
    if station is None:
        return " ".join(lines)

    if crop_name_ko:
        lines += _growth_stage_lines(db, plot, crop_name_ko, station)

    weather_line = _recent_weather_line(db, station)
    if weather_line:
        lines.append(weather_line)

    return " ".join(lines)