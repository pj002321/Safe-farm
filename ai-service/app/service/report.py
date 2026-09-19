"""밭 하나의 AI 생육 리포트. 대시보드에서 밭을 고르고 부를 때마다 그 시점 값으로
계산은 새로 하지만, LLM 호출(summary/todos/cautions)은 하루 한 번만 하고 advices
테이블에 캐시한다 — 같은 날 다시 부르면 저장된 문장을 그대로 돌려준다.

계산(GDD·강수·예보·특보)은 이미 있는 서비스(plot_growth.py·warn_region.py·
open_meteo_client.py)를 그대로 재사용한다. 여기서 하는 일은 그 값들을 한 덩이로
모아 LLM 에게 고정 JSON 요약을 시키는 것뿐이다 — 숫자 자체는 LLM 이 만들지 않는다.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.report_payload import ReportPayload, parse_report_json
from app.knowledge.embedder import get_client
from app.models.farm import Plot
from app.repo.advice import add_advice, add_farm_advice, advice_on, farm_advice_on
from app.repo.plot import plots_of_user
from app.service.plot_growth import (
    compute_plot_growth,
    daily_gdd_series,
    nearest_station,
    rainfall_totals,
)
from app.service.warn_region import plot_warning
from pipeline.open_meteo_client import fetch_daily_forecast, normalize_daily_forecast

SYSTEM_PROMPT = (
    "너는 농업 컨설턴트다. 아래 수치는 이 밭을 DB·기상 예보에서 실측·계산한 값이다 — "
    "숫자를 새로 지어내지 말고 주어진 값만 근거로 삼아라. "
    "병해충 진단을 확정하지 말고 관찰·관리 안내까지만 말하라. "
    "다른 텍스트 없이 다음 모양의 JSON 객체 하나만 출력하라: "
    '{"요약": "현재 생육 상태를 한두 문장으로", '
    '"할일": ["오늘·이번 주에 할 일"], "주의": ["주의해서 지켜볼 점"]}. '
    "할일·주의가 없으면 빈 배열로 둬라."
)


@dataclass
class ReportInput:
    # advices 캐시 키(cultivation_id + 오늘 날짜)로 쓴다.
    cultivation_id: uuid.UUID
    # 밭 전체 요약(_build_farm_prompt)에서 같은 작물 밭이 여럿일 때 구분하는 용도.
    # 사용자가 안 지었으면 None — 그때는 인덱스로 구분한다.
    plot_name: str | None
    crop_name_ko: str
    stage_name: str | None
    guide_text: str | None
    days_since_planting: int
    accumulated_gdd: float
    gdd_target: int | None
    stage_gdd_to: int | None
    water_need_mm: float | None
    fertilize_needed: bool
    rainfall_7d_mm: float | None
    tomorrow_temp_min: float | None
    tomorrow_temp_max: float | None
    tomorrow_rain_chance: float | None
    warnings: list[str]
    # 최근 14일 하루치 GDD. "왜 이 속도로 자랐나"(더워서/추워서)를 보여주는 용도 —
    # 기르는 중인 재배 건이 없거나 base_temp 를 모르면 None.
    gdd_trend: list[dict] | None
    # 최근 실측 속도로 목표 GDD 까지 남은 날짜를 역산한 값. 속도가 0 이거나
    # 이미 목표를 넘었으면 None/0 — daysToTarget(reportData.ts)와 같은 방식이다.
    days_to_target: int | None
    # 오늘 다음 날부터 최대 6일치 예보. 내일 예보(tomorrow_*)와 겹치지만
    # 저건 LLM 프롬프트용 단일 값이고 이건 화면의 주간 스트립용이다.
    forecast_week: list[dict] | None


def build_report_input(db: Session, plot: Plot) -> ReportInput | None:
    """근거가 없으면(관측소 없음·기르는 작물 없음) None — 리포트를 만들지 않는다."""
    station = nearest_station(db, plot)
    if station is None:
        return None
    growth = compute_plot_growth(db, plot, station)
    if growth is None:
        return None

    rainfall = rainfall_totals(db, station.station_code, windows=(7,))

    tomorrow = None
    forecast_week: list[dict] | None = None
    try:
        daily = fetch_daily_forecast(float(plot.latitude), float(plot.longitude))
        forecast = normalize_daily_forecast(daily)
        # index 0 = 오늘, 1 = 내일(open_meteo_client.py 의 순서).
        tomorrow = forecast[1] if len(forecast) > 1 else None
        forecast_week = forecast[1:7] if len(forecast) > 1 else None
    except Exception:  # noqa: BLE001 — 외부 API 장애로 리포트 전체를 막지 않는다
        tomorrow = None
        forecast_week = None

    try:
        warning, _ = plot_warning(db, float(plot.latitude), float(plot.longitude))
        warnings = list(warning["warnings"]) if warning and warning.get("warnings") else []
    except Exception:  # noqa: BLE001 — 특보 판정 실패도 리포트 전체를 막지 않는다
        warnings = []

    gdd_trend = daily_gdd_series(db, plot, station, days=14)
    days_to_target = _days_to_target(growth.accumulated_gdd, growth.gdd_target, gdd_trend)

    return ReportInput(
        cultivation_id=growth.cultivation_id,
        plot_name=plot.name,
        crop_name_ko=growth.crop_name_ko,
        stage_name=growth.stage_name,
        guide_text=growth.guide_text,
        days_since_planting=growth.days_since_planting,
        accumulated_gdd=growth.accumulated_gdd,
        gdd_target=growth.gdd_target,
        stage_gdd_to=growth.stage_gdd_to,
        water_need_mm=growth.water_need_mm,
        fertilize_needed=growth.fertilize_needed,
        rainfall_7d_mm=rainfall[7],
        tomorrow_temp_min=tomorrow["temp_min"] if tomorrow else None,
        tomorrow_temp_max=tomorrow["temp_max"] if tomorrow else None,
        tomorrow_rain_chance=tomorrow["rain_chance"] if tomorrow else None,
        warnings=warnings,
        gdd_trend=gdd_trend,
        days_to_target=days_to_target,
        forecast_week=forecast_week,
    )


def _days_to_target(
    accumulated_gdd: float, gdd_target: int | None, gdd_trend: list[dict] | None
) -> int | None:
    """최근(최대 7일) 평균 속도로 남은 GDD 를 나눈 값. `reportData.ts` 의
    `daysToTarget` 과 같은 방식이다. 목표를 모르거나 최근 속도가 0 이하면 None —
    "언제"를 지어내지 않는다."""
    if gdd_target is None or not gdd_trend:
        return None
    remaining = gdd_target - accumulated_gdd
    if remaining <= 0:
        return 0
    recent = gdd_trend[-7:]
    avg_rate = sum(d["gdd"] for d in recent) / len(recent)
    if avg_rate <= 0:
        return None
    return math.ceil(remaining / avg_rate)


def _build_prompt(report_input: ReportInput) -> str:
    lines = [
        f"작물: {report_input.crop_name_ko}",
        f"파종 후 {report_input.days_since_planting}일, 누적 GDD {report_input.accumulated_gdd}",
    ]
    if report_input.stage_name:
        lines.append(f"현재 생육단계: {report_input.stage_name}")
    if report_input.guide_text:
        lines.append(f"단계별 안내: {report_input.guide_text}")
    if report_input.water_need_mm is not None:
        rain = report_input.rainfall_7d_mm
        rain_text = f"{rain:.1f}mm" if rain is not None else "관측 없음"
        lines.append(f"이 단계 필요 수분량: {report_input.water_need_mm}mm, 최근 7일 강수량: {rain_text}")
    if report_input.fertilize_needed:
        lines.append("현재 시비 시기다.")
    if report_input.tomorrow_temp_min is not None:
        lines.append(
            f"내일 예보: 최저 {report_input.tomorrow_temp_min}도 / 최고 {report_input.tomorrow_temp_max}도, "
            f"강수확률 {report_input.tomorrow_rain_chance}%"
        )
    if report_input.warnings:
        lines.append(f"발효 중인 기상특보: {', '.join(report_input.warnings)}")
    return "\n".join(lines)


def generate_report(report_input: ReportInput) -> ReportPayload | None:
    """비스트리밍 호출 — 화면이 토큰 단위로 보여줄 이유가 없는 고정 JSON 이다."""
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_prompt(report_input)},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    if not content:
        return None
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return None
    return parse_report_json(data)


def get_cached_or_generate_report(db: Session, report_input: ReportInput) -> ReportPayload | None:
    """오늘치 캐시(advices)가 있으면 그대로 돌려주고, 없으면 LLM 을 불러 저장한다.
    LLM 호출을 하루에 한 번으로 묶어 토큰을 아끼는 게 목적이다."""
    today = date.today()
    try:
        cached = advice_on(db, report_input.cultivation_id, today)
    except Exception:  # noqa: BLE001 — 조회 실패도 로그에 남긴다
        logging.exception("[report] Advice 캐시 조회 실패")
        return None
    if cached is not None:
        return ReportPayload(summary=cached.summary, todos=list(cached.todos), cautions=list(cached.warnings))

    try:
        payload = generate_report(report_input)
    except Exception:  # noqa: BLE001 — LLM 호출 실패 시 캐시 없이 실패로 돌린다
        logging.exception("[report] generate_report 실패")
        return None
    if payload is None:
        logging.warning("[report] generate_report 가 None 반환")
        return None

    add_advice(
        db,
        report_input.cultivation_id,
        today,
        payload.summary,
        payload.todos,
        payload.cautions,
        json.loads(json.dumps(dataclasses.asdict(report_input), default=str)),
    )
    db.commit()
    return payload


FARM_SUMMARY_SYSTEM_PROMPT = (
    "너는 농업 컨설턴트다. 아래는 한 사용자가 기르는 밭 여러 곳을 각각 실측·계산한 "
    "값이다 — 숫자를 새로 지어내지 말고 주어진 값만 근거로 삼아라. "
    "밭 전체를 훑어 지금 가장 눈여겨봐야 할 것 위주로 두세 문장의 총평을 써라. "
    "같은 작물을 기르는 밭이 여럿일 수 있으니, 밭을 가리킬 때는 작물명 대신 "
    "주어진 밭 이름으로 불러라. "
    "다른 텍스트 없이 다음 모양의 JSON 객체 하나만 출력하라: "
    '{"요약": "밭 전체 총평 두세 문장"}.'
)


def build_farm_summary_inputs(db: Session, user_id: uuid.UUID) -> list[ReportInput]:
    """이 사용자의 밭 중 생육 근거를 만들 수 있는 것만 모은다(근거 없는 밭은 조용히 뺀다)."""
    plots = plots_of_user(db, user_id)
    inputs = [build_report_input(db, plot) for plot in plots]
    return [ri for ri in inputs if ri is not None]


def _build_farm_prompt(inputs: list[ReportInput]) -> str:
    lines = [f"밭 {len(inputs)}곳:"]
    for i, ri in enumerate(inputs, start=1):
        name = ri.plot_name or f"이름 없는 밭 {i}"
        line = f"{i}. {name}({ri.crop_name_ko}), 파종 후 {ri.days_since_planting}일, 누적 GDD {ri.accumulated_gdd}"
        if ri.stage_name:
            line += f", 현재 단계 {ri.stage_name}"
        if ri.warnings:
            line += f", 발효 중인 기상특보 {', '.join(ri.warnings)}"
        lines.append(line)
    return "\n".join(lines)


def generate_farm_summary(inputs: list[ReportInput]) -> str | None:
    if not OPENAI_MODEL:
        raise RuntimeError("OPENAI_MODEL 이 없습니다. ai-service/.env 를 확인하세요.")

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": FARM_SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": _build_farm_prompt(inputs)},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    if not content:
        return None
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return None
    summary = data.get("요약")
    return summary if isinstance(summary, str) and summary else None


def get_cached_or_generate_farm_summary(
    db: Session, user_id: uuid.UUID, inputs: list[ReportInput]
) -> str | None:
    """advices 와 같은 방침 — 사용자당 하루 한 번만 LLM 을 부르고 farm_advices 에 캐시한다."""
    today = date.today()
    try:
        cached = farm_advice_on(db, user_id, today)
    except Exception:  # noqa: BLE001 — 조회 실패도 로그에 남긴다
        logging.exception("[report] FarmAdvice 캐시 조회 실패")
        return None
    if cached is not None:
        return cached.summary

    try:
        summary = generate_farm_summary(inputs)
    except Exception:  # noqa: BLE001 — LLM 호출 실패 시 캐시 없이 실패로 돌린다
        return None
    if summary is None:
        return None

    add_farm_advice(
        db,
        user_id,
        today,
        summary,
        json.loads(json.dumps([dataclasses.asdict(ri) for ri in inputs], default=str)),
    )
    db.commit()
    return summary
