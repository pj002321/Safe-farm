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
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.gdd import past_target
from app.domain.kst import kst_hour, kst_today
from app.domain.report_payload import ReportPayload, parse_report_json
from app.domain.vegetation_text import Vegetation, summarize_points, vegetation_lines
from app.domain.water_balance import (
    WaterBalance,
    dryness_note,
    judge_water,
    관측을_밝힐까,
)
from app.knowledge.embedder import get_client
from app.models.farm import Advice, FarmAdvice, Plot
from app.service import forecast_cache
from app.service.disaster_notes import prevention_notes_for
from app.service.plot_growth import (
    compute_plot_growth,
    daily_gdd_series,
    nearest_station,
    rainfall_totals,
)
from app.service.satellite_cache import READ_DAYS
from app.service.satellite_cache import observations as satellite_observations
from app.service.warn_region import plot_warning
from pipeline.open_meteo_client import (
    daily_index_of,
    hourly_value_at,
    normalize_daily_forecast,
)

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
    # ⚠ **영영 빈 칸이다**(원천 없음 — crop_stage.py 주석). 지우지 않고 남기되
    #   판정·문장에 쓰지 않는다. 아래 셋이 그 자리를 이어받았다.
    water_need_mm: float | None
    fertilize_needed: bool
    #: Open-Meteo 물수지. 못 만들었으면 빈 값이라 프롬프트에 물 줄이 안 들어간다
    water: WaterBalance = field(default_factory=WaterBalance)
    #: 이 단계에 물주기·배수 작업이 있는가 (crop_stages)
    irrigate_needed: bool = False
    #: 지금 단계가 단계표의 마지막인가. '수확' 이라는 낱말을 믿어도 되는지 가른다 —
    #: 여러 번 거두는 작물은 수확이 중간에 온다(고추: 풋고추 → 붉은고추)
    is_last_stage: bool = False
    #: 이 품종의 단계 수. 하나뿐이면 단계 이름에 시기 정보가 없다(상추: '수확' 한 칸)
    stage_count: int = 0
    #: 이맘때 이 작물에 미리 해 둘 것(app/service/disaster_notes). 없으면 빈 튜플.
    #:
    #: ⚠ **지금 그 재해가 온다는 뜻이 아니다.** 해마다 이맘때 나오는 대비 요령이다 —
    #:   프롬프트가 그 선을 못박는다.
    prevention_notes: tuple[str, ...] = ()
    #: 조심할 재해 갈래 — ('가뭄','과습','저온' …)
    stage_hazards: tuple[str, ...] = ()
    rainfall_7d_mm: float | None = None
    tomorrow_temp_min: float | None = None
    tomorrow_temp_max: float | None = None
    tomorrow_rain_chance: float | None = None
    warnings: list[str] = field(default_factory=list)
    # 최근 14일 하루치 GDD. "왜 이 속도로 자랐나"(더워서/추워서)를 보여주는 용도 —
    # 기르는 중인 재배 건이 없거나 base_temp 를 모르면 None.
    gdd_trend: list[dict] | None = None
    # 최근 실측 속도로 목표 GDD 까지 남은 날짜를 역산한 값. 속도가 0 이거나
    # 이미 목표를 넘었으면 None/0 — daysToTarget(reportData.ts)와 같은 방식이다.
    days_to_target: int | None = None
    # 오늘 다음 날부터 최대 6일치 예보. 내일 예보(tomorrow_*)와 겹치지만
    # 저건 LLM 프롬프트용 단일 값이고 이건 화면의 주간 스트립용이다.
    forecast_week: list[dict] | None = None
    #: 위성이 본 것(NDVI·NDMI). **비어 있는 것이 기본값이다.**
    #:
    #: ⚠ `build_report_input` 이 채우지 않는다. 저 함수는 화면 경로라 매번 도는데,
    #:   위성은 왕복이 1.5초라 탭을 열 때마다 그만큼 느려진다. 그래서 **캐시가
    #:   빗나갔을 때만**(하루 한 번) 채운다 — `get_cached_or_generate_report`.
    vegetation: Vegetation = field(default_factory=Vegetation)


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
    water = WaterBalance()
    try:
        # ⚠ **왕복을 늘리지 않는다.** 이미 예보를 받는 호출이라, 물 수지에 필요한
        #   과거를 같은 요청에 얹는다(past_days). 따로 부르면 이 경로가 1.2초 더 느려지고
        #   그것이 **사용자 체감에 그대로 닿는다** — build_report_input 은 배치가 아니라
        #   화면 경로이고, advices 캐시보다 **먼저** 불린다(api/reports.py).
        #   실측(2026-09-19): payload 는 커져도 응답 시간은 거의 같다(1,17x ms).
        # ⚠ `fetch_daily_forecast` 로 바꾸지 말 것. **같은 요청 한 번**인데 저 래퍼는
        #   hourly 를 버린다 — 토양수분이 거기 실려 온다.
        # ⚠ 직접 부르지 않고 `forecast_cache` 를 지난다. 이 경로는 리포트 탭을 열
        #   때마다 도는데 Next 쪽에 `revalidateSec` 이 없어 매번 나가고 있었다.
        payload = forecast_cache.forecast(
            float(plot.latitude), float(plot.longitude), past_days=WATER_PAST_DAYS
        )
        daily = payload["daily"]
        forecast = normalize_daily_forecast(daily)
        # ⚠ **자리로 세지 않는다.** 예전에는 `forecast[1]` 을 내일로 봤는데, 그건
        #   `past_days=0` 일 때만 맞다. 물 수지를 내려고 과거를 같이 받는 순간 맨 앞이
        #   14일 전이 되어 **오류 없이** 서리 경고가 지난주 날씨로 나간다.
        #   오늘을 날짜로 찾고 그 다음날부터 센다.
        today_idx = daily_index_of(daily, kst_today().isoformat())
        if today_idx is None:
            # 응답에 오늘이 없다(타임존이 어긋났거나 형태가 다르다). 지난날을 내일이라고
            # 말하느니 예보를 비운다 — 아래 except 와 같은 판단이다.
            tomorrow = None
            forecast_week = None
        else:
            after = forecast[today_idx + 1 : today_idx + 7]
            tomorrow = after[0] if after else None
            forecast_week = after or None
            water = _water_from(
                forecast,
                today_idx,
                hourly_value_at(
                    payload.get("hourly"), kst_hour(), "soil_moisture_9_to_27cm"
                ),
            )
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
        is_last_stage=growth.is_last_stage,
        stage_count=growth.stage_count,
        prevention_notes=prevention_notes_for(db, growth.crop_name_ko, kst_today().month),
        water_need_mm=growth.water_need_mm,
        fertilize_needed=growth.fertilize_needed,
        water=water,
        irrigate_needed=growth.irrigate_needed,
        stage_hazards=growth.stage_hazards,
        rainfall_7d_mm=rainfall[7],
        tomorrow_temp_min=tomorrow["temp_min"] if tomorrow else None,
        tomorrow_temp_max=tomorrow["temp_max"] if tomorrow else None,
        tomorrow_rain_chance=tomorrow["rain_chance"] if tomorrow else None,
        warnings=warnings,
        gdd_trend=gdd_trend,
        days_to_target=days_to_target,
        forecast_week=forecast_week,
    )


#: 물수지를 낼 때 되돌아보는 날수. plot_tasks.WATER_PAST_DAYS 와 같은 값이어야 한다 —
#: 카드와 리포트가 다른 창을 보면 같은 밭에 서로 다른 말을 한다.
WATER_PAST_DAYS = 14


def _water_from(
    rows: list[dict], today_idx: int, soil_moisture: float | None = None
) -> WaterBalance:
    """이미 받아 둔 일별 예보에서 물 사정을 뽑는다. **새 호출을 하지 않는다.**

    ⚠ `rows` 는 과거를 포함한 배열이고 `today_idx` 가 오늘 자리다. 자리로 세면
      틀린다(open_meteo_client.daily_index_of 주석).
    """
    past = rows[max(0, today_idx - WATER_PAST_DAYS) : today_idx]
    ahead = rows[today_idx + 1 :]

    def 합(칸, 것들):
        값 = [x[칸] for x in 것들 if x.get(칸) is not None]
        return sum(값) if 값 else None

    비 = 합("rainfall_mm", past)
    증발 = 합("et0_mm", past)
    # ⚠ 한쪽만으로 낸 값은 뜻이 다르다. 둘 다 있어야 수지를 만든다
    수지 = None if (비 is None or 증발 is None) else 비 - 증발
    return WaterBalance(
        balance_14d_mm=수지,
        # 판정에는 안 쓰고 문장에만 쓴다 — water_balance.dryness_note 참고
        rain_past_mm=비,
        rain_past_days=len(past) or None,
        rain_3d_mm=합("rainfall_mm", ahead[:3]),
        rain_7d_mm=합("rainfall_mm", ahead[:7]),
        # ⚠ 판정을 뒤집지 않고 **등급만 거든다**(water_balance.is_soil_dry).
        #   모델값이라 우리 밭의 멀칭도 어제 준 물도 모른다.
        soil_moisture=soil_moisture,
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
    # ★ 2026-09-19 — **GDD 를 목표와 나란히 적는다.**
    #
    #   예전에는 "누적 GDD 1764.7" 만 줬다. 그 숫자만 보고는 지금이 모내기 직후인지
    #   추수 직전인지 알 수가 없다 — LLM 이 작물 상태를 못 맞히던 진짜 이유였다.
    지났다 = past_target(report_input.accumulated_gdd, report_input.gdd_target)
    목표 = ""
    if report_input.gdd_target is not None:
        넘음 = " — 이미 넘었다" if 지났다 else ""
        목표 = f" (다 자라는 데 필요한 양 {report_input.gdd_target}{넘음})"
    lines = [
        f"작물: {report_input.crop_name_ko}",
        f"파종 후 {report_input.days_since_planting}일, "
        f"누적 GDD {report_input.accumulated_gdd}{목표}",
    ]

    if report_input.stage_name:
        lines.append(f"현재 생육단계: {report_input.stage_name}")
    elif 지났다:
        # ⚠ **모름과 끝남을 같게 두지 않는다.** 단계표를 다 지나면 stage_name 이
        #   None 이 되는데, 예전에는 그냥 침묵해서 "단계를 모른다" 와 구분이 안 됐다.
        #   정작 그때가 가장 익은 때다 — 사용자의 논이 그랬다(마지막 단계 GDD 1521,
        #   누적 1764.7). 마스터 자료가 비어 모르는 경우는 여전히 침묵한다.
        lines.append("생육 단계표의 마지막을 지났다. 거둘 때로 본다.")
    if report_input.guide_text:
        lines.append(f"단계별 안내: {report_input.guide_text}")
    # ★ 2026-09-19 — **`water_need_mm` 을 떠났다.** 그 칸은 520행 내내 비어 있어
    #   이 블록이 영영 거짓이었고, 그래서 **리포트에 물 얘기가 한 번도 안 들어갔다.**
    #   필요량을 지어내는 대신 기상 사실을 주고 판단은 LLM 이 문장으로 하게 한다.
    #   ⚠ "몇 mm 주세요" 를 쓰게 하지 않는다 — ET0 가 잔디 기준이라 작물계수(Kc)
    #     없이는 양을 못 낸다. 아래 문장이 그 선을 지킨다.
    물근거 = dryness_note(report_input.water)
    if 물근거:
        # ⚠ 관측 강수를 **늘 적지 않는다.** 앞 문장이 이미 "2주 동안 비가 0.1mm" 라고
        #   말했는데 관측을 덧붙이면 같은 말을 두 번 한다. 어긋날 때만 밝힌다 —
        #   기준은 water_balance 한 곳에 있고 카드(task_rules)도 같은 함수를 쓴다.
        rain = report_input.rainfall_7d_mm
        if 관측을_밝힐까(report_input.water.rain_past_mm, rain):
            물근거 += f" 가까운 관측소의 최근 7일 강수량은 {rain:.1f}mm 다."
        lines.append(f"물 사정: {물근거}")
    if report_input.irrigate_needed:
        lines.append("이 단계는 물주기·배수 작업이 있는 시기다.")
    if report_input.stage_hazards:
        lines.append(f"이 단계에 잦은 기상 피해: {', '.join(report_input.stage_hazards)}")
    판정 = judge_water(report_input.water)
    if 판정 == "hold":
        # ⚠ '장마' 를 쓰지 말라고 못박는다. 7일 예보로 2~4주 현상을 말할 수 없다
        lines.append("앞으로 비가 많다. 물을 더 주라고 하지 말 것. '장마'라는 말은 쓰지 말 것.")
    elif 판정 in ("give", "watch"):
        lines.append("마른 쪽으로 기울었다. 다만 양(mm)을 지정하지 말고 시기만 말할 것.")
    # ── 위성 ──────────────────────────────────────────────────────
    # ⚠ **숫자를 주지 않는다.** `NDVI 0.787` 을 주면 LLM 이 그 숫자를 문장에 그대로
    #   적는다(SYSTEM_PROMPT 가 "주어진 값만 근거로" 라고 못박아 둔 탓이기도 하다).
    #   농민 화면에 NDVI 라는 말이 나가면 안 되므로, 규칙이 만든 **말**을 준다.
    #   규칙이 사실을 정하고 LLM 은 엮기만 한다.
    # ⚠ `past_gdd_target` 을 같이 넘긴다. 단계표를 지나면 stage_name 이 None 이라
    #   '익어 가는 중' 글자 판정이 통째로 거짓이 된다 — 정작 그때가 가장 익은
    #   때인데도. 그러면 추수 앞둔 논에 "잎의 물기가 줄었어요" 가 그대로 나간다.
    위성말 = vegetation_lines(
        report_input.vegetation,
        report_input.stage_name,
        is_last_stage=report_input.is_last_stage,
        stage_count=report_input.stage_count,
        past_gdd_target=지났다,
    )
    if 위성말:
        본날 = report_input.vegetation.observed_on
        lines.append(f"위성이 본 것({본날} 관측): {' '.join(위성말)}")
        lines.append("NDVI·NDMI 같은 말은 쓰지 말고 위 문장의 뜻만 쓸 것.")
    # ── 이맘때 미리 해 둘 것 ──────────────────────────────────────
    # ⚠ **"지금 그 재해가 온다" 가 아니다.** 해마다 이맘때 나오는 대비 요령이라
    #   단정하면 거짓이 된다. 한 번 틀린 경보를 보면 맞는 경보도 무시하게 된다.
    if report_input.prevention_notes:
        lines.append(f"이맘때 미리 해 두는 것: {' / '.join(report_input.prevention_notes)}")
        lines.append("지금 그 재해가 온다는 뜻으로 쓰지 말 것. 미리 대비하는 요령으로만 말할 것.")
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


def _vegetation_for(db: Session, plot: Plot) -> Vegetation:
    """이 밭의 위성 관측. **날씨 탭과 같은 표를 본다.**

    ⚠ 위성은 **더하는 신호지 의존하는 신호가 아니다**(sentinelhub_client 머리).
      못 받으면 빈 Vegetation 이라 프롬프트에서 위성 줄이 빠질 뿐이다 —
      `WaterBalance` 와 같은 원칙이다. 그래서 여기서 예외를 삼킨다.
    """
    오늘 = kst_today()
    try:
        points = satellite_observations(
            db,
            float(plot.latitude),
            float(plot.longitude),
            (오늘 - timedelta(days=READ_DAYS)).isoformat(),
            오늘.isoformat(),
        )
    except Exception:  # noqa: BLE001 — 위성이 없어도 기상만으로 리포트는 나온다
        logging.warning("[report] 위성 조회 실패 — 위성 없이 간다", exc_info=True)
        return Vegetation()
    return summarize_points(points)


def get_cached_or_generate_report(
    db: Session, report_input: ReportInput, plot: Plot | None = None
) -> ReportPayload | None:
    """오늘치 캐시(advices)가 있으면 그대로 돌려주고, 없으면 LLM 을 불러 저장한다.
    LLM 호출을 하루에 한 번으로 묶어 토큰을 아끼는 게 목적이다.

    ⚠ `plot` 을 받는 이유는 **위성을 여기서 부르기 위해서**다. 캐시가 맞으면 아예
      안 부른다 — `build_report_input` 에 넣었으면 탭을 열 때마다 1.5초가 붙는다.
      그 함수는 캐시보다 **먼저** 불리기 때문이다(api/reports.py).
      `plot` 이 없으면 위성 없이 간다(밭 전체 총평 경로).
    """
    today = date.today()
    try:
        cached = (
            db.query(Advice)
            .filter(
                Advice.cultivation_id == report_input.cultivation_id, Advice.advice_date == today
            )
            .first()
        )
    except Exception:  # noqa: BLE001 — 조회 실패도 로그에 남긴다
        logging.exception("[report] Advice 캐시 조회 실패")
        return None
    if cached is not None:
        return ReportPayload(
            summary=cached.summary, todos=list(cached.todos), cautions=list(cached.warnings)
        )

    # 캐시가 빗나갔다 — 여기서부터 하루 한 번이다. 이제 위성을 불러도 된다
    if plot is not None and not report_input.vegetation.observed_on:
        report_input = dataclasses.replace(report_input, vegetation=_vegetation_for(db, plot))

    try:
        payload = generate_report(report_input)
    except Exception:  # noqa: BLE001 — LLM 호출 실패 시 캐시 없이 실패로 돌린다
        logging.exception("[report] generate_report 실패")
        return None
    if payload is None:
        logging.warning("[report] generate_report 가 None 반환")
        return None

    db.add(
        Advice(
            cultivation_id=report_input.cultivation_id,
            advice_date=today,
            summary=payload.summary,
            todos=payload.todos,
            warnings=payload.cautions,
            input_snapshot=json.loads(json.dumps(dataclasses.asdict(report_input), default=str)),
        )
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
    plots = db.query(Plot).filter(Plot.user_id == user_id, Plot.deleted_at.is_(None)).all()
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
        cached = (
            db.query(FarmAdvice)
            .filter(FarmAdvice.user_id == user_id, FarmAdvice.advice_date == today)
            .first()
        )
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

    db.add(
        FarmAdvice(
            user_id=user_id,
            advice_date=today,
            summary=summary,
            input_snapshot=json.loads(
                json.dumps([dataclasses.asdict(ri) for ri in inputs], default=str)
            ),
        )
    )
    db.commit()
    return summary
