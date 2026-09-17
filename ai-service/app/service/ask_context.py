"""밭 하나의 최근 상태를 문장 재료로 만든다. `/ask` 가 이 결과를 LLM 프롬프트 앞에
붙여 일반론이 아니라 이 밭 기준으로 답하게 한다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

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


def _owned_plot(db: Session, plot_id: uuid.UUID, user_id: uuid.UUID) -> Plot | None:
    """이 사용자의 살아 있는 밭. 남의 밭이거나 지운 밭이면 None.

    **소유 확인을 여기서 한다.** plot_id 는 브라우저가 보낸 값이고, ai-service 는
    슈퍼유저로 붙어 RLS 를 타지 않는다 — 걸러 내지 않으면 남의 밭 id 하나로 그
    밭의 지역·작물·생육단계를 답변으로 되받을 수 있다. Next 쪽 화면이 자기 밭만
    고르게 해 두지만 그건 화면의 일이고, `/api/ai/ask` 는 직접 POST 할 수 있다.

    없는 밭과 남의 밭을 구분해 알리지 않는다 — 둘 다 None 이다. 구분하는 순간
    "그 id 의 밭이 존재한다"는 사실이 새어 나간다.
    """
    return (
        db.query(Plot)
        .filter(
            Plot.id == plot_id,
            Plot.user_id == user_id,
            Plot.deleted_at.is_(None),
        )
        .first()
    )


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


def _current_stage(
    db: Session, cultivation: Cultivation, crop: Crop, station: Station
) -> CropStage | None:
    """파종일부터 오늘까지 GDD 를 누적해 지금 걸린 생육단계를 찾는다.

    파종일을 모르면 None 이다 — 언제부터 쌓을지가 없으면 누적이 성립하지 않는다.
    그 품종의 단계표(crop_stages)가 비어 있을 때도 마찬가지다.

    누적값은 저장하지 않고 매번 관측에서 다시 쌓는다(웹의 gdd.ts 와 같은 방침).
    """
    if cultivation.sowing_date is None:
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

    return (
        db.query(CropStage)
        .filter(
            CropStage.variant_id == cultivation.variant_id,
            CropStage.gdd_from <= accumulated,
            CropStage.gdd_to > accumulated,
        )
        .first()
    )


def _growth_stage_lines(
    db: Session, cultivation: Cultivation, crop: Crop, station: Station
) -> list[str]:
    """현재 생육단계를 LLM 프롬프트에 붙일 한글 문장으로 옮긴다. 단계를 못 찾으면 빈 리스트."""
    stage = _current_stage(db, cultivation, crop, station)
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

    지운 건(deleted_at)도 뺀다. 삭제가 soft delete 라 행이 그대로 남아 있어,
    필터를 빼면 사용자가 지운 작물을 LLM 이 아직 기르는 것처럼 말한다.
    """
    return (
        db.query(Cultivation, Crop)
        .join(CropVariant, CropVariant.variant_id == Cultivation.variant_id)
        .join(Crop, Crop.crop_id == CropVariant.crop_id)
        .filter(
            Cultivation.plot_id == plot_id,
            Cultivation.status == "GROWING",
            Cultivation.deleted_at.is_(None),
        )
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


@dataclass(frozen=True)
class PlotFocus:
    """밭 하나를 한 줄로 요약할 때 쓰는 값. 추천 질문이 이걸 보고 문장을 고른다.

    문장이 아니라 값으로 돌려주는 이유는 `build_plot_context` 의 결과(완성된 한글
    문장)로는 "지금 단계가 무엇인가"를 되짚을 수 없어서다. 문장을 파싱하는 대신
    같은 조회를 한 번 더 하고 값으로 받는다.
    """

    region_ko: str | None
    crop_name: str
    stage_name: str | None
    guide_text: str | None


def plot_focus(db: Session, plot_id: uuid.UUID, user_id: uuid.UUID) -> PlotFocus | None:
    """밭의 대표 작물과 현재 생육단계. 남의 밭이거나 기르는 작물이 없으면 None.

    `build_plot_context` 와 같은 순서로 밭 → 재배 → 관측소 → 단계를 탄다. 한쪽만
    고치면 답변이 말하는 단계와 추천 질문이 말하는 단계가 갈린다.
    """
    plot = _owned_plot(db, plot_id, user_id)
    if plot is None:
        return None

    growing = _growing(db, plot.id)
    if not growing:
        return None

    cultivation, crop = _lead(growing)
    station = _nearest_station(db, plot)
    stage = _current_stage(db, cultivation, crop, station) if station else None

    return PlotFocus(
        region_ko=plot.region_ko,
        crop_name=crop.name,
        stage_name=stage.stage_name if stage else None,
        guide_text=stage.guide_text if stage else None,
    )


def build_plot_context(
    db: Session, plot_id: uuid.UUID, user_id: uuid.UUID
) -> str | None:
    """밭 하나를 조회해 LLM 프롬프트에 붙일 한글 문장을 만든다.

    남의 밭이거나, 지운 밭이거나, 기르는 작물이 없으면 None — 이때 /ask 는
    컨텍스트 없이 일반론으로 답한다. 소유 확인은 `_owned_plot` 이 한다.
    """
    plot = _owned_plot(db, plot_id, user_id)
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
