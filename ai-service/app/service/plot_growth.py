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

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.domain.gdd import daily_gdd
from app.domain.geo import nearest
from app.models.farm import Cultivation, Plot
from app.repo.crop import (
    stage_at_gdd,
    stage_by_order,
    usable_crop_of_variant,
    variant_by_id,
)
from app.repo.cultivation import lead_growing
from app.repo.station import StationRow, all_stations
from app.repo.weather_obs import rainfall_since, temps_since


@dataclass
class PlotGrowth:
    """필지 하나의 생육 상태 스냅샷. stage_name 이 None 이면 계산은 됐지만 해당하는
    단계 구간을 못 찾은 것이다(마지막 단계를 넘어섰거나 마스터 데이터 공백)."""

    # 대표 재배 건 id. advices 캐시 키(cultivation_id + 날짜)로 report.py 가 쓴다.
    cultivation_id: uuid.UUID
    crop_name_ko: str
    days_since_planting: int
    accumulated_gdd: float
    stage_name: str | None
    guide_text: str | None
    # 아래 둘은 stage_name 이 None 이면 같이 None/False 다 — 작업카드 판정(task_rules.py)이 씀
    water_need_mm: float | None
    fertilize_needed: bool
    # 씨뿌림→수확 총 목표 GDD. 역산이 안 끝난 숙기는 None(리포트 화면의 진행 게이지는
    # 이때 숨긴다 — 분모 없는 진행률은 거짓 숫자다).
    gdd_target: int | None
    # 현재 단계가 끝나는(=다음 단계가 시작하는) 누적 GDD. stage_name 이 None 이면 같이 None.
    stage_gdd_to: int | None


def nearest_station(db: Session, plot: Plot) -> StationRow | None:
    """밭과 대권거리가 가장 짧은 관측소. 관측소가 하나도 없으면 None.

    조회는 `repo.station` 이(캐시까지), 거리 계산은 `domain.geo.nearest` 가 한다.
    여기는 둘을 잇기만 한다 — `plot` 을 아는 건 service 뿐이라 이 자리에 둔다.
    """
    return nearest(float(plot.latitude), float(plot.longitude), all_stations(db))


def rainfall_totals(
    db: Session, station_code: str, windows: tuple[int, ...] = (3, 5, 7)
) -> dict[int, float | None]:
    """관측소 기준 최근 N일(windows) 누적 강수량. 그 구간에 관측이 하나도 없으면
    None(판정 보류) — `plot_tasks._recent_rain_mm` 과 같은 방침이다."""
    today = date.today()
    since = today - timedelta(days=max(windows))
    rows = rainfall_since(db, station_code, since)

    result: dict[int, float | None] = {}
    for n in windows:
        values = [mm for obs_date, mm in rows if mm is not None and (today - obs_date).days < n]
        result[n] = sum(values) if values else None
    return result


def _start_gdd(db: Session, cultivation: Cultivation) -> float:
    """적산을 시작할 GDD. 모종으로 시작했으면 0 이 아니다 — start_stage_order 가
    가리키는 단계의 gdd_from 부터 쌓는다. 씨부터면 0 에서 시작한다."""
    if cultivation.start_stage_order is None:
        return 0.0

    stage = stage_by_order(db, cultivation.variant_id, cultivation.start_stage_order)
    return float(stage.gdd_from) if stage is not None else 0.0


def daily_gdd_series(
    db: Session, plot: Plot, station: StationRow, days: int = 14
) -> list[dict] | None:
    """최근 days 일간 하루치 GDD. 생육 속도가 왜 그런지(더워서/추워서)를 막대로
    보여주는 용도 — 기르는 중인 재배 건이 없거나 그 작물의 base_temp 가 비어 있으면
    None(compute_plot_growth 와 같은 판정)."""
    cultivation = lead_growing(db, plot.id)
    if cultivation is None:
        return None
    crop = usable_crop_of_variant(db, cultivation.variant_id)
    if crop is None:
        return None

    since = max(cultivation.sowing_date, date.today() - timedelta(days=days))
    obs = temps_since(db, station.station_code, since)
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    return [
        {
            "date": o.obs_date.isoformat(),
            "gdd": round(
                daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper), 1
            ),
        }
        for o in obs
    ]


def crop_interpretation(db: Session, plot: Plot, station: StationRow) -> dict | None:
    """기상 수치를 이 밭 작물 기준과 견줄 근거(V1-64). base/upper 는 고온·저온
    스트레스 판정에, 현재 단계의 water_need_mm 은 관수 판정(rainfall_totals 의
    7일 창과 짝)에 쓴다. 기르는 중인 재배 건이 없거나
    그 작물의 base_temp 가 비어 있으면 None."""
    cultivation = lead_growing(db, plot.id)
    if cultivation is None:
        return None
    crop = usable_crop_of_variant(db, cultivation.variant_id)
    if crop is None:
        return None
    growth = compute_plot_growth(db, plot, station)
    return {
        "crop_name_ko": crop.name,
        "base_temp_c": float(crop.base_temp),
        "upper_temp_c": float(crop.upper_temp) if crop.upper_temp is not None else None,
        "stage_name": growth.stage_name if growth else None,
        "water_need_mm": growth.water_need_mm if growth else None,
    }


def compute_plot_growth(db: Session, plot: Plot, station: StationRow) -> PlotGrowth | None:
    """밭의 대표 재배 건을 골라 파종일부터 오늘까지 GDD 를 누적, 현재 생육단계를
    계산한다. 기르는 중인 재배 건이 없거나 파종일·base_temp 를 모르면 None."""
    cultivation = lead_growing(db, plot.id)
    if cultivation is None:
        return None

    crop = usable_crop_of_variant(db, cultivation.variant_id)
    if crop is None:
        return None

    obs = temps_since(db, station.station_code, cultivation.sowing_date)
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    accumulated = _start_gdd(db, cultivation) + sum(
        daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper) for o in obs
    )

    stage = stage_at_gdd(db, cultivation.variant_id, accumulated)
    variant = variant_by_id(db, cultivation.variant_id)

    return PlotGrowth(
        cultivation_id=cultivation.id,
        crop_name_ko=crop.name,
        days_since_planting=(date.today() - cultivation.sowing_date).days,
        accumulated_gdd=round(accumulated, 1),
        stage_name=stage.stage_name if stage else None,
        guide_text=stage.guide_text if stage else None,
        water_need_mm=float(stage.water_need_mm) if stage and stage.water_need_mm is not None else None,
        fertilize_needed=bool(stage.fertilize_needed) if stage else False,
        gdd_target=variant.gdd_target if variant else None,
        stage_gdd_to=stage.gdd_to if stage else None,
    )
