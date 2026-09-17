"""필지 하나의 누적 GDD·생육단계 계산. ask_context.py(LLM 프롬프트용 문장)와 작업카드
생성·필지 요약 스트립(구조화된 값이 필요한 곳)이 같이 쓴다 — 계산은 여기 한 곳에서만
하고, 나머지는 이 결과를 문장으로 조립하거나 화면에 얹기만 한다.

계산식 자체(daily_gdd)는 app/domain/gdd.py 순수 함수. 여기는 DB에서 파종일·관측·
작물 마스터를 모아 그 함수에 먹이기만 한다.

작물·파종일은 plots 가 아니라 cultivations 에 있다(20260916010000_plots_drop_crop_columns.sql
이후). 한 밭에 여러 재배 건이 있을 수 있어 대표 한 건(가장 먼저 심은 것)만 골라 쓴다 —
ask_context.py 의 `_lead` 와 같은 기준이다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.domain.gdd import daily_gdd
from app.domain.geo import haversine_km
from app.models.farm import Crop, CropStage, CropVariant, Cultivation, Plot, Station, WeatherObsDaily


@dataclass
class PlotGrowth:
    """필지 하나의 생육 상태 스냅샷. stage_name 이 None 이면 계산은 됐지만 해당하는
    단계 구간을 못 찾은 것이다(마지막 단계를 넘어섰거나 마스터 데이터 공백)."""

    crop_name_ko: str
    days_since_planting: int
    accumulated_gdd: float
    stage_name: str | None
    guide_text: str | None
    # 아래 둘은 stage_name 이 None 이면 같이 None/False 다 — 작업카드 판정(task_rules.py)이 씀
    water_need_mm: float | None
    fertilize_needed: bool


def nearest_station(db: Session, plot: Plot) -> Station | None:
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


def _lead_cultivation(db: Session, plot: Plot) -> Cultivation | None:
    """지금 기르는 재배 건 중 대표 한 건(가장 먼저 심은 것). 파종일을 모르는 건은
    GDD 를 못 내므로 후보에서 뺀다 — ask_context.py 의 `_lead` 와 같은 기준이다."""
    return (
        db.query(Cultivation)
        .filter(
            Cultivation.plot_id == plot.id,
            Cultivation.status == "GROWING",
            Cultivation.sowing_date.isnot(None),
        )
        .order_by(Cultivation.sowing_date)
        .first()
    )


def _start_gdd(db: Session, cultivation: Cultivation) -> float:
    """적산을 시작할 GDD. 모종으로 시작했으면 0 이 아니다 — start_stage_order 가
    가리키는 단계의 gdd_from 부터 쌓는다. 씨부터면 0 에서 시작한다."""
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


def compute_plot_growth(db: Session, plot: Plot, station: Station) -> PlotGrowth | None:
    """밭의 대표 재배 건을 골라 파종일부터 오늘까지 GDD 를 누적, 현재 생육단계를
    계산한다. 기르는 중인 재배 건이 없거나 파종일을 모르면 None."""
    cultivation = _lead_cultivation(db, plot)
    if cultivation is None:
        return None

    variant = db.query(CropVariant).filter(CropVariant.variant_id == cultivation.variant_id).first()
    if variant is None:
        return None
    crop = db.query(Crop).filter(Crop.crop_id == variant.crop_id).first()
    if crop is None:
        return None

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

    return PlotGrowth(
        crop_name_ko=crop.name,
        days_since_planting=(date.today() - cultivation.sowing_date).days,
        accumulated_gdd=round(accumulated, 1),
        stage_name=stage.stage_name if stage else None,
        guide_text=stage.guide_text if stage else None,
        water_need_mm=float(stage.water_need_mm) if stage and stage.water_need_mm is not None else None,
        fertilize_needed=bool(stage.fertilize_needed) if stage else False,
    )
