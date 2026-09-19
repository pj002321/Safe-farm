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
    # 아래 넷은 stage_name 이 None 이면 같이 비어 있다 — 작업카드 판정(task_rules.py)이 씀
    #
    # ⚠️ water_need_mm 은 **영영 빈 칸이다**(2026-09-19 마이그레이션 주석). 원천이
    #    없어 채우지 않기로 했고, 그 자리를 irrigate_needed 와 stage_hazards 가
    #    대신한다. 필요량(mm)이 아니라 **시기**다 — "이 단계에 물이 중요한가".
    #    "지금 마른가"는 기상이 댄다. 필드를 지우지 않는 이유는 CSV 계약 헤더에
    #    남아 있어서다(같은 주석).
    water_need_mm: float | None
    #: 이 단계에 물주기·배수 작업이 있는가 (crop_stages.irrigate_needed)
    irrigate_needed: bool
    fertilize_needed: bool
    #: 조심할 재해 갈래 — ('가뭄','과습','저온' …). CSV 가 쉼표로 이어 준 것을 쪼갠다
    stage_hazards: tuple[str, ...] = ()
    #: 농작업 갈래 — ('웃거름','물주기','배수' …)
    stage_tasks: tuple[str, ...] = ()
    # 씨뿌림→수확 총 목표 GDD. 역산이 안 끝난 숙기는 None(리포트 화면의 진행 게이지는
    # 이때 숨긴다 — 분모 없는 진행률은 거짓 숫자다).
    gdd_target: int | None = None
    # 현재 단계가 끝나는(=다음 단계가 시작하는) 누적 GDD. stage_name 이 None 이면 같이 None.
    stage_gdd_to: int | None = None


def _split(value: str | None) -> tuple[str, ...]:
    """쉼표로 이은 칸을 튜플로. 빈 칸·None 은 빈 튜플이다.

    ⚠ 빈 조각을 버린다 — 'a,,b' 나 끝의 쉼표가 빈 문자열을 만들면 `'' in hazards` 같은
      검사가 엉뚱하게 참이 된다.
    """
    if not value:
        return ()
    return tuple(x.strip() for x in value.split(",") if x.strip())


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


def rainfall_totals(
    db: Session, station_code: str, windows: tuple[int, ...] = (3, 5, 7)
) -> dict[int, float | None]:
    """관측소 기준 최근 N일(windows) 누적 강수량. 그 구간에 관측이 하나도 없으면
    None(판정 보류) — `plot_tasks._recent_rain_mm` 과 같은 방침이다."""
    today = date.today()
    since = today - timedelta(days=max(windows))
    rows = (
        db.query(WeatherObsDaily.obs_date, WeatherObsDaily.rainfall_mm)
        .filter(WeatherObsDaily.station_code == station_code, WeatherObsDaily.obs_date >= since)
        .all()
    )

    result: dict[int, float | None] = {}
    for n in windows:
        values = [
            float(r.rainfall_mm)
            for r in rows
            if r.rainfall_mm is not None and (today - r.obs_date).days < n
        ]
        result[n] = sum(values) if values else None
    return result


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


def _crop_for_cultivation(db: Session, cultivation: Cultivation) -> Crop | None:
    """재배 건의 작물 마스터. variant 가 없거나, 끝의 crop 이 없거나,
    **기준온도(base_temp)가 비어 있으면** None.

    ⚠️ base_temp 를 여기서 함께 거른다. 이 값은 GDD 계산의 전제라 없으면 생육을
       낼 수 없는데, 쓰는 곳이 셋이다(daily_gdd_series · crop_interpretation ·
       compute_plot_growth). 셋 다 이미 `crop is None` 을 검사하므로, 호출부마다
       가드를 흩뿌리는 대신 조회 한 곳에서 "쓸 수 없는 작물"로 처리한다.

       운영에서 실제로 마스터에 base_temp 가 빈 작물이 있었고, float(None) 이
       터지면서 **자정 배치 전체가 죽었다** — 밭 하나의 데이터 결손이 모든
       사용자의 할 일을 막았다.

       0 이나 추정값으로 메우지 않는다. 지역 지도용 기본값(`BASE_TEMP_C`)을 끌어
       쓰면 작물별 값인 척하는 틀린 숫자가 되고, 그 위에서 나온 생육단계와 물·비료
       카드는 근거가 거짓이 된다. "근거를 못 만들면 카드를 만들지 않는다"는 스펙
       규칙대로 판정을 보류한다.
    """
    variant = db.query(CropVariant).filter(CropVariant.variant_id == cultivation.variant_id).first()
    if variant is None:
        return None
    crop = db.query(Crop).filter(Crop.crop_id == variant.crop_id).first()
    if crop is None or crop.base_temp is None:
        return None
    return crop


def daily_gdd_series(
    db: Session, plot: Plot, station: Station, days: int = 14
) -> list[dict] | None:
    """최근 days 일간 하루치 GDD. 생육 속도가 왜 그런지(더워서/추워서)를 막대로
    보여주는 용도 — 기르는 중인 재배 건이 없거나 그 작물의 base_temp 가 비어 있으면
    None(compute_plot_growth 와 같은 판정)."""
    cultivation = _lead_cultivation(db, plot)
    if cultivation is None:
        return None
    crop = _crop_for_cultivation(db, cultivation)
    if crop is None:
        return None

    since = max(cultivation.sowing_date, date.today() - timedelta(days=days))
    obs = (
        db.query(WeatherObsDaily)
        .filter(
            WeatherObsDaily.station_code == station.station_code,
            WeatherObsDaily.obs_date >= since,
            WeatherObsDaily.temp_max.isnot(None),
            WeatherObsDaily.temp_min.isnot(None),
        )
        .order_by(WeatherObsDaily.obs_date)
        .all()
    )
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


def crop_interpretation(db: Session, plot: Plot, station: Station) -> dict | None:
    """기상 수치를 이 밭 작물 기준과 견줄 근거(V1-64). base/upper 는 고온·저온
    스트레스 판정에, 현재 단계의 water_need_mm 은 관수 판정(rainfall_totals 의
    7일 창과 짝)에 쓴다. 기르는 중인 재배 건이 없거나
    그 작물의 base_temp 가 비어 있으면 None."""
    cultivation = _lead_cultivation(db, plot)
    if cultivation is None:
        return None
    crop = _crop_for_cultivation(db, cultivation)
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


def compute_plot_growth(db: Session, plot: Plot, station: Station) -> PlotGrowth | None:
    """밭의 대표 재배 건을 골라 파종일부터 오늘까지 GDD 를 누적, 현재 생육단계를
    계산한다. 기르는 중인 재배 건이 없거나 파종일·base_temp 를 모르면 None."""
    cultivation = _lead_cultivation(db, plot)
    if cultivation is None:
        return None

    crop = _crop_for_cultivation(db, cultivation)
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

    variant = db.query(CropVariant).filter(CropVariant.variant_id == cultivation.variant_id).first()

    return PlotGrowth(
        cultivation_id=cultivation.id,
        crop_name_ko=crop.name,
        days_since_planting=(date.today() - cultivation.sowing_date).days,
        accumulated_gdd=round(accumulated, 1),
        stage_name=stage.stage_name if stage else None,
        guide_text=stage.guide_text if stage else None,
        water_need_mm=float(stage.water_need_mm)
        if stage and stage.water_need_mm is not None
        else None,
        fertilize_needed=bool(stage.fertilize_needed) if stage else False,
        irrigate_needed=bool(stage.irrigate_needed) if stage else False,
        # ⚠ CSV 가 쉼표로 이은 한 칸이다('가뭄,과습'). 쪼개는 것은 **여기 한 곳**에서만 한다 —
        #   시더는 통째로 넣고(master_seed_farm_db 주석), 읽는 쪽이 푼다.
        stage_hazards=_split(stage.stage_hazards) if stage else (),
        stage_tasks=_split(stage.stage_tasks) if stage else (),
        gdd_target=variant.gdd_target if variant else None,
        stage_gdd_to=stage.gdd_to if stage else None,
    )
