"""AI 생육 리포트 조회.

밭 하나를 골라 부르면 그 자리에서 GDD·강수·예보·특보를 모은다. LLM 요약은 하루
한 번만 부르고 advices 에 캐시한다(report.py 의 get_cached_or_generate_report).
"""

from __future__ import annotations

import uuid

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.repo.plot import count_plots_of_user, owned_plot
from app.service.report import (
    build_farm_summary_inputs,
    build_report_input,
    get_cached_or_generate_farm_summary,
    get_cached_or_generate_report,
)

router = APIRouter(prefix="/v1/reports", tags=["reports"])


@router.get("/farm-summary", dependencies=[Depends(require_service_token)])
def farm_summary(user_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """사용자의 밭 전체를 아우르는 하루 한 번짜리 AI 총평. 밭이 없으면 NO_PLOTS,
    밭은 있는데 어디서도 생육 근거를 못 만들면 NO_GROWTH_DATA다."""
    try:
        plot_count = count_plots_of_user(db, user_id)
        if plot_count == 0:
            return {"available": False, "reason": "NO_PLOTS"}

        inputs = build_farm_summary_inputs(db, user_id)
        if not inputs:
            return {"available": False, "reason": "NO_GROWTH_DATA"}

        summary = get_cached_or_generate_farm_summary(db, user_id, inputs)
        if summary is None:
            return {"available": False, "reason": "GENERATION_FAILED"}

        return {"available": True, "summary": summary, "plotCount": len(inputs)}
    except Exception as exc:  # noqa: BLE001 — 리포트 생성 실패는 500 이 아니라 GENERATION_FAILED 로
        logging.exception("[report] farm_summary 실패: %s", exc)
        return {"available": False, "reason": "GENERATION_FAILED"}


@router.get("/{plot_id}", dependencies=[Depends(require_service_token)])
def plot_report(plot_id: uuid.UUID, user_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """없는 밭과 남의 밭을 구분해 알리지 않는다 — 둘 다 PLOT_NOT_FOUND 다."""
    try:
        plot = owned_plot(db, plot_id, user_id)
        if plot is None:
            return {"available": False, "reason": "PLOT_NOT_FOUND"}

        report_input = build_report_input(db, plot)
        if report_input is None:
            return {"available": False, "reason": "NO_GROWTH_DATA"}

        # plot 을 같이 넘긴다 — 캐시가 빗나갔을 때만 위성을 부르기 위해서다.
        # build_report_input 에 넣으면 탭을 열 때마다 왕복이 붙는다(report.py 주석).
        payload = get_cached_or_generate_report(db, report_input, plot)
        if payload is None:
            return {"available": False, "reason": "GENERATION_FAILED"}

        return {
            "available": True,
            "cropNameKo": report_input.crop_name_ko,
            "stageName": report_input.stage_name,
            "daysSincePlanting": report_input.days_since_planting,
            "accumulatedGdd": report_input.accumulated_gdd,
            "gddTarget": report_input.gdd_target,
            "stageGddTo": report_input.stage_gdd_to,
            "waterNeedMm": report_input.water_need_mm,
            "rainfall7dMm": report_input.rainfall_7d_mm,
            "tomorrowTempMin": report_input.tomorrow_temp_min,
            "tomorrowTempMax": report_input.tomorrow_temp_max,
            "tomorrowRainChance": report_input.tomorrow_rain_chance,
            "warnings": report_input.warnings,
            "gddTrend": report_input.gdd_trend,
            "daysToTarget": report_input.days_to_target,
            "forecastWeek": report_input.forecast_week,
            "summary": payload.summary,
            "todos": payload.todos,
            "cautions": payload.cautions,
        }
    except Exception as exc:  # noqa: BLE001 — 리포트 생성 실패는 500 이 아니라 GENERATION_FAILED 로
        logging.exception("[report] plot_report 실패: %s", exc)
        return {"available": False, "reason": "GENERATION_FAILED"}
