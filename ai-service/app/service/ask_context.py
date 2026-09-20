"""밭 하나의 최근 상태를 문장 재료로 만든다. `/ask` 가 이 결과를 LLM 프롬프트 앞에
붙여 일반론이 아니라 이 밭 기준으로 답하게 한다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.domain.gdd import daily_gdd
from app.service.ask_extras import extra_context_lines
from app.models.farm import Crop, CropStage, Cultivation
from app.repo.crop import stage_at_gdd, stage_by_order
from app.repo.cultivation import growing_with_crop
from app.repo.plot import owned_plot
from app.repo.station import StationRow
from app.repo.weather_obs import latest_temps, temps_since

# ⚠ 관측소 고르기는 `plot_growth` 것을 그대로 쓴다. 여기 한 벌 더 두었다가 한쪽만
#   고쳐서 /ask 가 말하는 관측소와 리포트가 쓰는 관측소가 갈린 적이 있다.
from app.service.plot_growth import nearest_station

RECENT_WEATHER_DAYS = 7


def _start_gdd(db: Session, cultivation: Cultivation) -> float:
    """적산을 시작할 GDD.

    모종으로 시작했으면 0 이 아니다 — 그 모종은 이미 어느 단계까지 자란 상태로
    밭에 들어왔다. start_stage_order 가 가리키는 단계의 gdd_from 부터 쌓는다.
    씨부터면 start_stage_order 가 비어 있고 0 에서 시작한다.
    """
    if cultivation.start_stage_order is None:
        return 0.0
    stage = stage_by_order(db, cultivation.variant_id, cultivation.start_stage_order)
    return float(stage.gdd_from) if stage is not None else 0.0


def _current_stage(
    db: Session, cultivation: Cultivation, crop: Crop, station: StationRow
) -> CropStage | None:
    """파종일부터 오늘까지 GDD 를 누적해 지금 걸린 생육단계를 찾는다.

    파종일을 모르면 None 이다 — 언제부터 쌓을지가 없으면 누적이 성립하지 않는다.
    그 품종의 단계표(crop_stages)가 비어 있거나 작물의 base_temp 가 비어 있을 때도
    마찬가지다.

    작물의 기준온도(base_temp)가 비어 있을 때도 None 이다 — GDD 는 기준온도 없이
    정의되지 않는다.

    누적값은 저장하지 않고 매번 관측에서 다시 쌓는다(웹의 gdd.ts 와 같은 방침).
    """
    if cultivation.sowing_date is None:
        return None
    # `base_temp` 가 없으면 적산을 시작할 기준이 없다. 지역 지도용 기본값(`BASE_TEMP_C`)을
    # 끌어 쓰면 작물별 값인 척하는 틀린 숫자가 된다 — 근거가 없으면 판정하지 않는다.
    if crop.base_temp is None:
        return None

    obs = temps_since(db, station.station_code, cultivation.sowing_date)
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    accumulated = _start_gdd(db, cultivation) + sum(
        daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper) for o in obs
    )

    return stage_at_gdd(db, cultivation.variant_id, accumulated)


def _growth_stage_lines(
    db: Session, cultivation: Cultivation, crop: Crop, station: StationRow
) -> list[str]:
    """현재 생육단계를 LLM 프롬프트에 붙일 한글 문장으로 옮긴다. 단계를 못 찾으면 빈 리스트."""
    stage = _current_stage(db, cultivation, crop, station)
    if stage is None:
        return []
    lines = [f"{crop.name}의 현재 생육단계는 {stage.stage_name}이다."]
    if stage.guide_text:
        lines.append(stage.guide_text)
    return lines


def _recent_weather_line(db: Session, station: StationRow) -> str | None:
    """최근 며칠 평균 최고기온 한 줄. 관측이 없으면 None."""
    recent = latest_temps(db, station.station_code, RECENT_WEATHER_DAYS)
    temps = [float(o.temp_max) for o in recent]
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
    return growing_with_crop(db, plot_id)


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
    plot = owned_plot(db, plot_id, user_id)
    if plot is None:
        return None

    growing = _growing(db, plot.id)
    if not growing:
        return None

    cultivation, crop = _lead(growing)
    station = nearest_station(db, plot)
    stage = _current_stage(db, cultivation, crop, station) if station else None

    return PlotFocus(
        region_ko=plot.region_ko,
        crop_name=crop.name,
        stage_name=stage.stage_name if stage else None,
        guide_text=stage.guide_text if stage else None,
    )


def plot_crop_names(db: Session, plot_id: uuid.UUID, user_id: uuid.UUID) -> set[str]:
    """이 밭에서 지금 기르는 작물 이름들. 남의 밭이거나 기르는 게 없으면 빈 집합.

    RAG 검색(app/knowledge/retriever.py)이 질문에서 작물을 못 찾았을 때(find_crops
    가 빈 집합) 이 밭의 작물로 좁히는 데 쓴다. 안 쓰면 필터 없이 전체 문서를 뒤져
    무관한 작물 문서가 섞여 들어온다 — "밀린 일"이 질문에 없는 '밀' 문서를 근거로
    끌어온 사례(2026-09-18). 감자·상추만 기르는 밭이면 밀 문서는 애초에 후보에서
    빠진다.
    """
    plot = owned_plot(db, plot_id, user_id)
    if plot is None:
        return set()
    return {crop.name for _, crop in _growing(db, plot.id)}


def build_plot_context(
    db: Session, plot_id: uuid.UUID, user_id: uuid.UUID, question: str | None = None
) -> str | None:
    """밭 하나를 조회해 LLM 프롬프트에 붙일 한글 문장을 만든다.

    남의 밭이거나, 지운 밭이거나, 기르는 작물이 없으면 None — 이때 /ask 는
    컨텍스트 없이 일반론으로 답한다. 소유 확인은 `repo.plot.owned_plot` 이 한다.
    """
    plot = owned_plot(db, plot_id, user_id)
    if plot is None:
        return None

    # 질문이 물어본 갈래(비·태풍 …)는 재배 중인 작물과 무관하다 — 아래 growing
    # 조회 뒤에서 부르면, 작물을 등록 안 한 밭은 이 갈래 질문에도 답을 못 받는다
    # (ask_extras.extra_context_lines 를 gate 만 옮긴 것과 같은 이유의 버그였다).
    추가 = extra_context_lines(db, plot, question=question)

    growing = _growing(db, plot.id)
    if not growing:
        return " ".join(추가) if 추가 else None

    # 심은 것은 전부 말한다. 생육단계는 대표 한 건으로만 낸다 — 작물마다 파종일도
    # 목표 GDD 도 달라서 한 문장으로 합칠 수 없다.
    crop_names = " · ".join(crop.name for _, crop in growing)
    lines = [f"이 밭은 {plot.region_ko}에 있고 {crop_names}를 재배 중이다."]

    station = nearest_station(db, plot)
    if station is None:
        return " ".join(lines + 추가)

    cultivation, crop = _lead(growing)
    lines += _growth_stage_lines(db, cultivation, crop, station)

    weather_line = _recent_weather_line(db, station)
    if weather_line:
        lines.append(weather_line)

    lines += 추가
    return " ".join(lines)
