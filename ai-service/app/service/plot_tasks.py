"""필지별 작업카드 생성. 매일 00시 배치(아직 스케줄러가 없어 Step 미정, pipeline
스크립트로 수동 실행)가 이 모듈의 `generate_daily_tasks` 를 부른다. 00시인 이유는
농부들이 새벽부터 일을 시작해서다 — 밭에 나갈 때 이미 그날 카드가 있어야 한다.

매주가 아니라 매일 판정하는 이유: 강수량 같은 판정 기준이 날마다 바뀐다. 주 1회만
갱신하면 화·수에 비가 와도 금요일 카드엔 반영되지 않는다. `existing_open_titles`
가 막아 주므로 매일 돌려도 미완료 카드가 중복 생기지는 않는다.

판정 자체(무슨 카드를 만들지)는 app/domain/task_rules.py 순수 함수가 한다. 여기는
DB에서 값을 모아 넘기고, 나온 후보를 plot_tasks 테이블에 적재하기만 한다.
"""

from __future__ import annotations

import traceback
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.domain.gdd import past_target
from app.domain.kst import KST, kst_hour, kst_today
from app.domain.task_rules import (
    DRY_MM,
    RAIN_WINDOW_DAYS,
    PlotTaskInputs,
    build_task_candidates,
)
from app.domain.vegetation_text import Vegetation, summarize_points
from app.domain.water_balance import WaterBalance, judge_water
from app.models.farm import Plot, PlotTask, WeatherObsDaily
from app.service.crop_hazard import temp_limits_for
from app.service.pest_notes import pest_names_for
from app.service.plot_growth import (
    _crop_for_cultivation,
    _lead_cultivation,
    compute_plot_growth,
    nearest_station,
)
from app.service.satellite_cache import stored_observations
from app.service.warn_region import plot_warning
from pipeline.open_meteo_client import (
    daily_index_of,
    fetch_forecast,
    hourly_value_at,
    normalize_daily_forecast,
)

#: 안 하고 넘어간 카드를 닫기까지의 일수.
#:
#: ⚠️ **화면의 이월 기간과 같은 값이어야 한다**
#:    (Next: features/dashboard/domain/taskSummary.ts 의 CARRY_OVER_DAYS).
#:    두 값이 어긋나면 둘 중 하나가 일어난다 —
#:      · 여기가 더 길면: 화면에서 사라진 카드가 생성을 계속 막는다(가뭄이 이어져도
#:        물 주기 카드가 안 뜬다). 이 상수를 만든 이유가 바로 이것이다.
#:      · 여기가 더 짧으면: 화면에 "3일째"로 남아 있는 카드가 이미 닫혀서,
#:        같은 제목의 새 카드가 그 옆에 하나 더 뜬다.
EXPIRE_AFTER_DAYS = 3


def _expire_cutoff(now: datetime | None = None) -> datetime:
    """이 시각보다 먼저 만들어진 미완료 카드를 닫는다.

    오늘(KST) 00:00 에서 EXPIRE_AFTER_DAYS 만큼 거슬러 간 시각이다. **날짜 경계로
    자르는 것이 핵심이다** — "지금부터 72시간 전"으로 하면 배치가 도는 시각이
    몇 분만 밀려도 경계에 걸친 카드가 어떤 날은 닫히고 어떤 날은 안 닫힌다.
    """
    kst_now = (now or datetime.now(timezone.utc)).astimezone(KST)
    kst_day_start = kst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return kst_day_start - timedelta(days=EXPIRE_AFTER_DAYS)


def expire_stale_tasks(db: Session, plot_id, now: datetime | None = None) -> int:
    """밭 하나의 오래된 미완료 카드를 닫고, 닫은 개수를 돌려준다.

    지우지 않는다 — "안 하고 넘어갔다"는 사실이 이력이다. 이미 닫힌 카드는 다시
    건드리지 않는다(expired_at is null 조건).
    """
    result = db.execute(
        update(PlotTask)
        .where(
            PlotTask.plot_id == plot_id,
            PlotTask.done.is_(False),
            PlotTask.expired_at.is_(None),
            PlotTask.generated_at < _expire_cutoff(now),
        )
        .values(expired_at=func.now())
    )
    return result.rowcount or 0


def _skip(plot: Plot, reason: str) -> None:
    """이 밭에서 카드가 안 나온 이유를 남긴다.

    `created: 0` 만 보고는 "데이터가 없다"와 "오늘 할 일이 없다"를 구분할 수 없다.
    실제로 그 둘을 못 가려 원인을 좁히는 데 한참 걸렸다. 밭마다 한 줄씩 남긴다.
    """
    print(f"[tasks] 밭 {plot.id} 건너뜀 — {reason}", flush=True)


def _why_no_growth(db: Session, plot: Plot) -> str:
    """compute_plot_growth 가 None 인 이유를 좁힌다. 사람이 고칠 수 있는 것부터."""
    cultivation = _lead_cultivation(db, plot)
    if cultivation is None:
        return "기르는 중인 작물이 없습니다 — 밭에 작물을 등록하세요"
    if cultivation.sowing_date is None:
        return "파종일이 없습니다 — 밭 상세에서 파종일을 입력하세요"

    crop = _crop_for_cultivation(db, cultivation)
    if crop is None:
        return (
            "작물 마스터에 기준온도(base_temp)가 없거나 품종이 연결되지 않았습니다 "
            "— crops.base_temp 를 채우세요"
        )
    return "생육단계를 낼 수 없습니다 — crop_stages 와 관측 자료를 확인하세요"


#: 관측이 이보다 오래됐으면 **없는 셈 친다**(일).
#:
#: ⚠ 창(READ_DAYS=90)과 다른 값이다. 창은 "점을 찾아볼 범위" 이고 이건 "그 점을
#:   지금 것으로 쳐도 되나" 다.
#:
#: 14일인 까닭 — 이 값이 **물 카드를 막는** 데 쓰인다. 열흘 전 잎으로 오늘 물
#: 카드를 막으면 그 사이 마른 밭이 조용해진다. 관측이 평균 18일에 한 번이라
#: 좁으면 걸리는 밭이 줄 것을 걱정했는데, 실측(2026-09-19 · 밭 6곳)으로 **최장이
#: 11일**이라 여섯 곳이 다 걸렸다. 좁은 쪽이 안전하고 손해도 없다.
SATELLITE_FRESH_DAYS = 14


def _vegetation(db: Session, plot: Plot) -> Vegetation:
    """이 밭의 **최근** 위성 관측. 오래됐거나 없으면 빈 값이다.

    ⚠ 여기서 Sentinel Hub 를 부르면 밭마다 1.5초가 붙어 50초 한도에 금방 닿는다.
      표에 있는 것만 본다 — 표를 채우는 일은 사람이 날씨 화면을 열 때 일어난다.

    ⚠ **날짜를 여기서 거른다.** domain(task_rules)은 시계를 읽지 않으므로, 오래된
      관측은 이 자리에서 빈 값으로 지워 넘긴다.
    """
    points = stored_observations(
        db, float(plot.latitude), float(plot.longitude), SATELLITE_FRESH_DAYS
    )
    return summarize_points(points)


def _active_warnings(db: Session, plot: Plot) -> tuple[str, ...]:
    """이 밭에 지금 걸려 있는 기상특보 종류. 못 읽으면 빈 튜플이다.

    ⚠ `warn_region.plot_warning` 을 **부르기만** 한다 — 리포트(report.py)도 같은
      함수를 쓴다. 특보 판정은 거기 한 곳이고 여기서 다시 하지 않는다.

    ⚠ 실패해도 배치를 막지 않는다. 특보를 못 읽으면 대비 카드가 안 나갈 뿐이고,
      물·시비 카드는 그대로 나가야 한다(_plot_weather 와 같은 판단).
    """
    try:
        warning, _ = plot_warning(db, float(plot.latitude), float(plot.longitude))
    except Exception:  # noqa: BLE001 — 특보 조회 실패가 나머지 카드를 막지 않는다
        return ()
    if not warning:
        return ()
    return tuple(warning.get("warnings") or ())


def _recent_rain_mm(db: Session, station_code: str) -> float | None:
    """최근 RAIN_WINDOW_DAYS 일 누적 강수량. 관측이 하나도 없으면 None(판정 보류)."""
    since = date.today() - timedelta(days=RAIN_WINDOW_DAYS)
    rows = (
        db.execute(
            select(WeatherObsDaily.rainfall_mm).where(
                WeatherObsDaily.station_code == station_code,
                WeatherObsDaily.obs_date >= since,
            )
        )
        .scalars()
        .all()
    )
    values = [float(r) for r in rows if r is not None]
    return sum(values) if values else None


#: 물수지를 낼 때 되돌아보는 날수. 14일이면 한 번의 소나기에 안 흔들리고,
#: 뿌리대가 마르는 데 걸리는 시간과도 얼추 맞는다(조사 §4-1).
WATER_PAST_DAYS = 14


#: 좌표를 묶는 소수점 자리. 2자리면 약 1km 다 — 예보 격자보다 촘촘해서 값이 안 흔들린다.
#: 실측(2026-09-19): 밭 28개 중 예보가 필요한 10개가 좌표 7개로 묶인다.
_COORD_NDIGITS = 2


@dataclass(frozen=True)
class _PlotWeather:
    """한 번의 Open-Meteo 호출에서 나오는 것 둘.

    ⚠ **왕복을 늘리지 않으려고 같이 들고 나온다.** 내일 기온은 물수지를 낼 때
      이미 받아 둔 응답 안에 있다. 따로 부르면 밭마다 1.2초가 더 붙는다.
    """

    water: WaterBalance
    #: 내일 예보 한 줄(temp_min·temp_max·rainfall_mm …). 못 찾으면 None
    tomorrow: dict | None = None


def _plot_weather(plot: Plot, memo: dict | None = None) -> _PlotWeather:
    """밭 좌표의 물 사정과 내일 예보. Open-Meteo **한 번의 호출**로 둘 다 받는다.

    ⚠ **밭마다 한 번씩 나간다.** 하루 1회 배치라 감당되지만, 따로 부르면 왕복이 둘이
      되고 밭 수만큼 곱해진다 — past_days 와 forecast_days 를 한 요청에 같이 준다.

    ⚠ **자리로 오늘을 찾지 않는다.** past_days 를 주면 배열 맨 앞이 14일 전이다.
      날짜로 찾는다(daily_index_of). 못 찾으면 빈 WaterBalance 를 돌려주고, 그러면
      judge_water 가 None 이라 **물 카드를 안 만든다** — 틀린 근거로 조언하느니 침묵한다.

    ⚠ 외부 API 장애가 배치 전체를 막지 않는다. 시비 카드는 기상과 무관하게 나가야 한다.

    `memo` 는 **한 번의 배치 안에서만 사는 사전**이다. 같은 마을의 밭 둘이 같은 예보를
    두 번 받아 오지 않게 한다 — 실측으로 10회가 7회로 준다.
    ⚠ 모듈 수준 캐시(`lru_cache`)를 쓰지 않는다. 이 레포의 `lru_cache` 는 전부
      `maxsize=1` 짜리 **참조 데이터**용이다(map.py · sigungu_ref · warn_region).
      예보는 시시각각 바뀌므로 배치가 끝나면 같이 사라져야 한다. 호출자가 사전을
      만들어 넘기면 수명이 그 배치로 묶인다.
    """
    키 = (
        round(float(plot.latitude), _COORD_NDIGITS),
        round(float(plot.longitude), _COORD_NDIGITS),
    )
    if memo is not None and 키 in memo:
        return memo[키]

    결과 = _fetch_plot_weather(float(plot.latitude), float(plot.longitude))
    if memo is not None:
        memo[키] = 결과
    return 결과


def _fetch_plot_weather(lat: float, lon: float) -> _PlotWeather:
    """실제로 부르는 쪽. 메모가 없을 때만 여기까지 온다."""
    try:
        payload = fetch_forecast(lat, lon, past_days=WATER_PAST_DAYS)
        daily = payload["daily"]
        rows = normalize_daily_forecast(daily)
    except Exception:  # noqa: BLE001 — 기상이 없어도 시비 판정은 해야 한다
        return _PlotWeather(WaterBalance())

    today = daily_index_of(daily, kst_today().isoformat())
    if today is None:
        return _PlotWeather(WaterBalance())

    past = rows[max(0, today - WATER_PAST_DAYS) : today]
    ahead = rows[today + 1 :]

    def 합(칸, 것들):
        값 = [x[칸] for x in 것들 if x.get(칸) is not None]
        return sum(값) if 값 else None

    비 = 합("rainfall_mm", past)
    증발 = 합("et0_mm", past)
    # ⚠ 둘 중 하나라도 없으면 수지를 만들지 않는다. 한쪽만으로 낸 값은 뜻이 다르다
    수지 = None if (비 is None or 증발 is None) else 비 - 증발

    물 = WaterBalance(
        balance_14d_mm=수지,
        # ⚠ 판정에는 안 쓰고 **문장에만** 쓴다. 사람에게는 "비가 0.1mm" 가 통하고
        #   "-56mm"(증발산을 뺀 값)는 안 통한다 — dryness_note 참고
        rain_past_mm=비,
        rain_past_days=len(past) or None,
        rain_3d_mm=합("rainfall_mm", ahead[:3]),
        rain_7d_mm=합("rainfall_mm", ahead[:7]),
        # ★ 2026-09-19 — 채웠다. `d0001f3` 부터 None 이라 **is_soil_dry 가 영영
        #   거짓**이었고, 그래서 물 카드가 '급함' 으로 올라간 적이 없었다.
        #   왕복은 안 는다 — 같은 응답의 hourly 에 실려 온다.
        soil_moisture=hourly_value_at(payload.get("hourly"), kst_hour(), "soil_moisture_9_to_27cm"),
    )
    return _PlotWeather(물, tomorrow=ahead[0] if ahead else None)


def generate_tasks_for_plot(
    db: Session, plot: Plot, water_memo: dict | None = None
) -> list[PlotTask]:
    """밭 하나를 판정해 새 카드를 만든다.

    **먼저 오래된 미완료 카드를 닫는다.** 순서가 중요하다 — 닫기 전에 판정하면
    그 카드가 아직 "열린 제목"이라 같은 카드의 재생성을 막는다. 사용자는 홈에서
    그 카드를 이미 못 보고 있으므로, 조건이 여전한데도 할 일이 없는 것처럼 보인다.

    닫고 난 뒤에도 살아 있는(미완료·미만료) 같은 제목의 카드가 있으면 새로 만들지
    않는다. 배치를 하루에 여러 번 돌려도 카드가 중복 쌓이지 않게 하는 장치다.
    """
    expire_stale_tasks(db, plot.id)

    # ⚠️ 아래 조기 return 들은 **만료를 커밋한 뒤** 나가야 한다. 관측소나 생육
    #    정보가 없는 밭이라고 해서 오래된 카드를 계속 열어 둘 이유는 없다.
    station = nearest_station(db, plot)
    if station is None:
        db.commit()
        _skip(plot, "관측소가 배정되지 않았습니다 — stations 마스터를 확인하세요")
        return []

    growth = compute_plot_growth(db, plot, station)
    if growth is None:
        db.commit()
        # 여기 묶이는 이유가 여럿이다(재배 없음·작물 없음·기준온도 없음·파종일 없음).
        # 어느 쪽인지 좁혀 줘야 다음 사람이 DB 를 뒤지지 않는다.
        _skip(plot, _why_no_growth(db, plot))
        return []

    # 한 번의 Open-Meteo 호출에서 물수지와 내일 예보를 같이 꺼낸다
    날씨 = _plot_weather(plot, water_memo)
    내일 = 날씨.tomorrow or {}
    한계 = temp_limits_for(db, growth.crop_name_ko)

    inputs = PlotTaskInputs(
        crop_name_ko=growth.crop_name_ko,
        stage_name=growth.stage_name,
        # 시기 — crop_stages. water_need_mm 자리를 이 셋이 이어받았다
        irrigate_needed=growth.irrigate_needed,
        stage_hazards=growth.stage_hazards,
        stage_tasks=growth.stage_tasks,
        fertilize_needed=growth.fertilize_needed,
        # 사정 — 기상. 못 만들면 빈 값이라 물 카드가 안 나온다(시비는 그대로 나간다)
        water=날씨.water,
        recent_rain_mm=_recent_rain_mm(db, station.station_code),
        # 수확 — GDD 가 '때'를, 위성이 '아직 있나'를 말한다(task_rules 주석)
        gdd_target_passed=past_target(growth.accumulated_gdd, growth.gdd_target),
        sow_method=growth.sow_method,
        vegetation=_vegetation(db, plot),
        # 이맘때 이 작물에 자주 나오는 병해충. DB 조회 한 번이라 배치를 안 늦춘다
        pest_names=pest_names_for(db, growth.crop_name_ko, kst_today()),
        # 재해 — 기상청이 판정한 것을 **받아 적기만** 한다(task_rules 주석)
        warnings=_active_warnings(db, plot),
        # 기온 한계 — 작물이 몇 도부터 상하나 × 내일 예보
        frost_limit_c=한계.frost_c,
        heat_limit_c=한계.heat_c,
        tomorrow_temp_min=내일.get("temp_min"),
        tomorrow_temp_max=내일.get("temp_max"),
    )
    candidates = build_task_candidates(inputs)
    if not candidates:
        db.commit()
        # 0건이 **정상인 유일한 경로**다 — 조건을 봤고 할 일이 없었다는 뜻이다.
        # 위의 건너뜀들과 섞이면 "데이터가 없다"와 "할 일이 없다"를 구분할 수 없다.
        _skip(
            plot,
            f"조건 미달 — 물판정 {judge_water(inputs.water)}"
            f"(14일수지 {inputs.water.balance_14d_mm}mm · 3일비 {inputs.water.rain_3d_mm}mm"
            f" · 7일비 {inputs.water.rain_7d_mm}mm)"
            f" · 관수시기 {inputs.irrigate_needed} · 재해 {inputs.stage_hazards or '없음'}"
            f" · 시비 {inputs.fertilize_needed}"
            f" · 관측 {RAIN_WINDOW_DAYS}일 강수 {inputs.recent_rain_mm}mm"
            f"(안전망 마름 기준 {DRY_MM}mm 이하)",
        )
        return []

    # "살아 있는" 카드만 재생성을 막는다 — 닫힌 카드(expired_at)는 세지 않는다.
    # 이 조건을 빠뜨리면 만료 처리 자체가 무의미해진다.
    existing_open_titles = {
        title
        for (title,) in db.execute(
            select(PlotTask.title).where(
                PlotTask.plot_id == plot.id,
                PlotTask.done.is_(False),
                PlotTask.expired_at.is_(None),
            )
        ).all()
    }

    created: list[PlotTask] = []
    for candidate in candidates:
        if candidate.title in existing_open_titles:
            continue
        task = PlotTask(
            plot_id=plot.id,
            title=candidate.title,
            reason=candidate.reason,
            priority=candidate.priority,
        )
        db.add(task)
        created.append(task)

    # 만료 처리는 새 카드가 하나도 안 나와도 반영돼야 한다 — 조건이 해소돼서
    # 후보가 없는 경우에도 오래된 카드는 닫혀야 한다. 그래서 무조건 커밋한다.
    db.commit()
    return created


def generate_daily_tasks(db: Session) -> int:
    """살아 있는 밭을 판정한다. 매일 00시(KST) 배치의 진입점.

    삭제는 soft delete 라 지운 밭도 `plots` 에 그대로 남아 있다(`deleted_at`).
    거르지 않으면 지운 밭에 매일 카드가 새로 쌓인다 — 화면에는 Next 쪽 조인
    조건(`taskStore.listTaskCards` 의 `plots.deleted_at is null`)이 가려 주므로
    보이지 않고, 그래서 더 늦게 발견된다. ask_context.py 와 같은 조건이다.

    ⚠️ **밭 하나의 실패가 나머지를 막지 않는다.** 예전에는
       `sum(... for plot in plots)` 한 줄이라, 밭 하나에서 예외가 나면 그 자리에서
       배치가 끝났다. 실제로 마스터 데이터에 base_temp 가 빈 작물 하나 때문에
       **모든 사용자의 할 일이 하루 통째로 안 생겼다.**

       이건 증상 감추기가 아니다. 밭들은 서로 독립이고, 한 밭의 데이터 결손은
       다른 밭의 판정과 아무 상관이 없다. 그래서 격리하되 **삼키지는 않는다** —
       어느 밭에서 무엇이 터졌는지 스택까지 남긴다. 조용히 넘어가면 결손이
       영원히 안 보인다.

       rollback 이 필요한 이유: 예외가 난 세션은 다음 질의부터 전부 거부한다.
       걷어내지 않으면 격리해도 나머지 밭이 줄줄이 실패한다.
    """
    plots = db.query(Plot).filter(Plot.deleted_at.is_(None)).all()

    created = 0
    # 같은 마을의 밭들이 같은 예보를 거듭 받아 오지 않게 한다. 이 배치가 끝나면
    # 사전도 같이 사라진다 — 예보는 시시각각 바뀌므로 다음 배치는 새로 받아야 한다.
    water_memo: dict = {}
    for plot in plots:
        try:
            created += len(generate_tasks_for_plot(db, plot, water_memo))
        except Exception:
            db.rollback()
            traceback.print_exc()
            print(f"[tasks] 밭 {plot.id} 판정 실패 — 건너뛰고 계속합니다", flush=True)

    return created
