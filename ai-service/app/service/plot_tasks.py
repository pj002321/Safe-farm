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
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import KMA_API_KEY
from app.domain.gdd import past_target
from app.domain.kst import KST, kst_hour, kst_today
from app.domain.task_rules import (
    DRY_MM,
    RAIN_WINDOW_DAYS,
    PlotTaskInputs,
    build_task_candidates,
)
from app.domain.typhoon import TyphoonPoint, is_approaching, split_track
from app.domain.vegetation_text import Vegetation, summarize_points
from app.domain.water_balance import WaterBalance, judge_water
from app.models.farm import Plot, PlotTask, WeatherObsDaily
from app.repo.crop import usable_crop_of_variant
from app.repo.cultivation import growing_in_order
from app.repo.plot import all_live_plots
from app.repo.plot_task import add_task, expire_open_before, open_titles
from app.repo.weather_obs import rainfall_since
from app.service import forecast_cache
from app.service.crop_hazard import temp_limits_for
from app.service.pest_notes import pest_names_for
from app.service.plot_growth import cultivation_growth, nearest_station
from app.service.satellite_cache import stored_observations
from app.service.typhoon_cache import track as typhoon_track
from app.service.warn_region import plot_warning
from pipeline.farm.sync_plot_grids import sync as sync_plot_grids
from pipeline.open_meteo_client import (
    daily_index_of,
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
    return expire_open_before(db, plot_id, _expire_cutoff(now))


def _skip(plot: Plot, reason: str) -> None:
    """이 밭에서 카드가 안 나온 이유를 남긴다.

    `created: 0` 만 보고는 "데이터가 없다"와 "오늘 할 일이 없다"를 구분할 수 없다.
    실제로 그 둘을 못 가려 원인을 좁히는 데 한참 걸렸다. 밭마다 한 줄씩 남긴다.
    """
    print(f"[tasks] 밭 {plot.id} 건너뜀 — {reason}", flush=True)


def _why_no_growth(db: Session, cultivation) -> str:
    """`cultivation_growth` 가 None 인 이유를 좁힌다. 사람이 고칠 수 있는 것부터.

    ⚠ **재배 건 단위다.** 전에는 밭을 받아 대표 한 건만 봤는데, 그러면 밭에 작물이
      여럿일 때 **엉뚱한 작물의 사정**이 까닭으로 적힌다.
    """
    if cultivation.sowing_date is None:
        return "파종일이 없습니다 — 밭 상세에서 파종일을 입력하세요"

    crop = usable_crop_of_variant(db, cultivation.variant_id)
    if crop is None:
        return (
            "작물 마스터에 기준온도(base_temp)가 없거나 품종이 연결되지 않았습니다 "
            "— crops.base_temp 를 채우세요"
        )
    return "생육단계를 낼 수 없습니다 — crop_stages 와 관측 자료를 확인하세요"


def _crop_label(db: Session, cultivation) -> str:
    """건너뜀 기록에 적을 작물 이름. 못 찾으면 품종 id 로 대신한다.

    이름을 못 읽는 것이 곧 건너뛴 까닭일 수 있어(품종 연결 끊김) 여기서 터지면 안 된다.
    """
    crop = usable_crop_of_variant(db, cultivation.variant_id)
    return crop.name if crop is not None else f"품종 {cultivation.variant_id}"


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


def _fetch_typhoon_forecast() -> tuple[TyphoonPoint, ...]:
    """지금 진행 중인 태풍의 예측 경로. 없거나 못 받으면 빈 튜플이다.

    ⚠ typhoon.py(지도 레이어)와 같은 자료원이다 — 판정을 새로 하지 않는다.
    """
    if not KMA_API_KEY:
        return ()
    try:
        rows = typhoon_track(KMA_API_KEY)
    except Exception:  # noqa: BLE001 — 외부 API 장애가 나머지 카드를 막지 않는다
        return ()
    _, forecast = split_track(rows)
    return tuple(forecast)


def _active_warnings(
    db: Session, plot: Plot, typhoon_forecast: tuple[TyphoonPoint, ...] | None = None
) -> tuple[str, ...]:
    """이 밭에 지금 걸려 있는 기상특보 종류. 못 읽으면 빈 튜플이다.

    ⚠ `warn_region.plot_warning` 을 **부르기만** 한다 — 리포트(report.py)도 같은
      함수를 쓴다. 특보 판정은 거기 한 곳이고 여기서 다시 하지 않는다.

    ⚠ 실패해도 배치를 막지 않는다. 특보를 못 읽으면 대비 카드가 안 나갈 뿐이고,
      물·시비 카드는 그대로 나가야 한다(_plot_weather 와 같은 판단).

    ⚠ **한국 지역특보보다 먼저 "태풍" 을 켤 수 있다.** 지역특보는 태풍이 실제로
      한국에 닿아야 뜨는데, 그때까지 기다리면 대비가 늦다 — 예보 경로가 이
      밭에 닿는 범위(`typhoon.is_approaching`)면 특보 발효 전에도 켠다.

    ⚠ `typhoon_forecast` 는 배치가 미리 받아 넘긴 것을 쓴다(없으면 직접 받는다) —
      밭마다 기상청을 새로 부르면 배치 시간이 밭 수만큼 늘어난다.
    """
    경보: set[str] = set()
    try:
        warning, _ = plot_warning(db, float(plot.latitude), float(plot.longitude))
        if warning:
            경보.update(warning.get("warnings") or ())
    except Exception:  # noqa: BLE001 — 특보 조회 실패가 나머지 카드를 막지 않는다
        pass

    태풍경로 = typhoon_forecast if typhoon_forecast is not None else _fetch_typhoon_forecast()
    if is_approaching(태풍경로, float(plot.latitude), float(plot.longitude)):
        경보.add("태풍")

    return tuple(경보)


def _recent_rain_mm(db: Session, station_code: str) -> float | None:
    """최근 RAIN_WINDOW_DAYS 일 누적 강수량. 관측이 하나도 없으면 None(판정 보류)."""
    since = date.today() - timedelta(days=RAIN_WINDOW_DAYS)
    values = [mm for _, mm in rainfall_since(db, station_code, since) if mm is not None]
    return sum(values) if values else None


#: 물수지를 낼 때 되돌아보는 날수. 14일이면 한 번의 소나기에 안 흔들리고,
#: 뿌리대가 마르는 데 걸리는 시간과도 얼추 맞는다(조사 §4-1).
WATER_PAST_DAYS = 14


#: 미리 받을 때 동시에 나가는 갈래 수.
#:
#:   2026-09-19 — **호출을 동시에 내보내 배치를 6.6배 줄였다.**
#:   1.2초는 응답 크기가 아니라 왕복 지연이라(past_days 0·14 가 둘 다 1.16초),
#:   순서대로 기다릴 이유가 없었다. 실측 좌표 15개: 순차 18.0초 → 병렬 2.7초.
#:   결과값은 동일했다.
#:
#:     이 수를 올려도 크게 안 빨라진다. 50초 한도 기준 이미 좌표 275개까지 간다
#:     (지금 15개).
#:    **이 수가 곧 속도 제한기다.** 한 갈래가 초당 0.83회(1.2초/회)이므로
#:     대략 `갈래 × 50회/분` 이 나간다 — 8이면 분당 400회다. Open-Meteo 무료 한도가
#:     분당 600회이니 **12를 넘기지 말 것.** 넘기면 그 좌표들이 통째로 빈
#:     WaterBalance 가 되어 **물 카드가 없어진다.**
_PREFETCH_WORKERS = 8


@dataclass(frozen=True)
class _PlotWeather:
    """한 번의 Open-Meteo 호출에서 나오는 것 둘.

    ⚠ **왕복을 늘리지 않으려고 같이 들고 나온다.** 내일 기온은 물수지를 낼 때
      이미 받아 둔 응답 안에 있다. 따로 부르면 밭마다 1.2초가 더 붙는다.
    """

    water: WaterBalance
    #: 내일 예보 한 줄(temp_min·temp_max·rainfall_mm …). 못 찾으면 None
    tomorrow: dict | None = None


def _memo_key(plot: Plot) -> tuple:
    """예보 메모의 열쇠. **미리 받는 쪽과 꺼내 쓰는 쪽이 같은 열쇠를 써야 한다** —
    한쪽만 고치면 미리 받아 놓고도 다시 부른다.

    ⚠ **`forecast_cache` 와 같은 열쇠를 쓴다.** 두 층이 "같은 자리" 를 다르게 세면
      메모는 갈라 놓고 캐시가 도로 합치는 꼴이 된다. 밖으로 나가는 횟수는 같지만
      어느 층이 무엇을 막았는지 읽을 수 없게 된다.

    ⚠ 좌표가 없는 밭에는 못 쓴다. 부르는 쪽이 먼저 거른다.
    """
    return forecast_cache.grid_cache_key(plot.grid_x, plot.grid_y)


def _plot_weather(plot: Plot, memo: dict | None = None) -> _PlotWeather:
    """밭 좌표의 물 사정과 내일 예보. Open-Meteo **한 번의 호출**로 둘 다 받는다.

    ⚠ **좌표마다 한 번씩 나간다.** 따로 부르면 왕복이 둘이 되고 좌표 수만큼
      곱해진다 — past_days 와 forecast_days 를 한 요청에 같이 준다.

    ⚠ **자리로 오늘을 찾지 않는다.** past_days 를 주면 배열 맨 앞이 14일 전이다.
      날짜로 찾는다(daily_index_of). 못 찾으면 빈 WaterBalance 를 돌려주고, 그러면
      judge_water 가 None 이라 **물 카드를 안 만든다** — 틀린 근거로 조언하느니 침묵한다.

    ⚠ 외부 API 장애가 배치 전체를 막지 않는다. 시비 카드는 기상과 무관하게 나가야 한다.

    **아낌이 두 겹이다.** 수명이 달라서 둘 다 둔다 —

        memo               이 배치 안에서만 산다. 같은 마을의 밭 둘을 한 번으로 묶는다
        forecast_cache     요청 사이에 산다(1시간). 리포트 탭과 배치 재실행이 받는다

    ⚠ `lru_cache` 는 쓰지 않는다. 이 레포의 `lru_cache` 는 전부 `maxsize=1` 짜리
      **참조 데이터**용이고(map.py · sigungu_ref · warn_region) 만료가 없다.
      예보는 시시각각 바뀌므로 만료가 있어야 한다 — 그래서 `forecast_cache` 가
      TTL 과 **한국 날짜**를 같이 본다(자정을 넘기면 tomorrow 가 오늘이 된다).
    """
    키 = _memo_key(plot)
    if memo is not None and 키 in memo:
        return memo[키]

    결과 = _fetch_plot_weather(float(plot.latitude), float(plot.longitude), 키)
    if memo is not None:
        memo[키] = 결과
    return 결과


def _fetch_plot_weather(lat: float, lon: float, cache_key: tuple) -> _PlotWeather:
    """실제로 부르는 쪽. 메모가 없을 때만 여기까지 온다.

    ⚠ 좌표와 열쇠를 **둘 다** 받는다. 열쇠는 격자라 좌표로 되돌릴 수 없는데,
      밖으로 나가는 호출은 실제 좌표라야 한다(`forecast_cache.forecast` 의 ⚠).
    """
    try:
        payload = forecast_cache.forecast(
            lat, lon, past_days=WATER_PAST_DAYS, cache_key=cache_key
        )
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


def _prefetch_weather(plots: Sequence[Plot], memo: dict) -> None:
    """루프에 들기 전에 좌표들의 예보를 **동시에** 받아 `memo` 를 채운다.

    ★ 2026-09-19 — 이것만으로 배치가 18.0초 → 2.7초가 됐다(좌표 15개 실측).
      판정 코드는 한 줄도 안 바뀐다 — `_plot_weather` 가 원래 메모를 먼저 보므로,
      여기서 미리 채워 두면 루프는 그냥 꺼내 쓴다.

    ⚠ **이것은 최적화지 판정의 일부가 아니다.** 실패해도 루프가 제 발로 받아 온다.
      그래서 예외를 여기서 끝내고 배치를 멈추지 않는다. 미리 받기가 통째로 실패한
      날은 느려질 뿐 결과는 같다.

    ⚠ 좌표가 없는 밭은 건너뛴다. `_memo_key` 가 float(None) 에서 터지는데, 그건
      그 밭 하나의 문제라 `generate_daily_tasks` 의 밭별 try 가 받는 것이 맞다.
      미리 받기가 대신 터져 주면 **멀쩡한 밭까지 느려진다.**

    # params
    plots: 이번 배치가 판정할 밭들. **제너레이터를 넘기면 안 된다** — 부르는 쪽이
        이걸 부른 뒤 같은 것을 또 도는데, 제너레이터면 그 루프가 조용히 빈다<br>
    memo: `_plot_weather` 에 넘길 사전. 여기서 제자리(in-place)로 채운다<br>

    # returns
    없다. `memo` 가 바뀐다

    # examples
        memo = {}
        _prefetch_weather(plots, memo)
        _plot_weather(plots[0], memo)   # -> 표에서 나온다. 호출 0회
    """
    # 열쇠마다 **먼저 나온 밭의 실제 좌표**를 쓴다. 루프가 혼자 돌 때와 같은 좌표라야
    # 값이 똑같다. 열쇠는 격자(≈5km)라 애초에 좌표로 되돌릴 수도 없다 — 예전 반올림
    # 좌표 열쇠로 불렀을 때도 300~600m 옆을 묻게 돼 15개 중 10개에서 수지가 최대
    # 0.08mm 어긋났다(2026-09-19). 판정을 뒤집을 크기는 아니지만, 빨라지자고 값을
    # 바꾸면 나중에 원인을 못 찾는다.
    대표: dict[tuple, tuple[float, float]] = {}
    for p in plots:
        if p.latitude is None or p.longitude is None:
            continue
        키 = _memo_key(p)
        if 키 not in memo:
            대표.setdefault(키, (float(p.latitude), float(p.longitude)))
    if not 대표:
        return

    차례 = list(대표)
    try:
        with ThreadPoolExecutor(max_workers=min(_PREFETCH_WORKERS, len(차례))) as ex:
            받은것 = ex.map(lambda k: _fetch_plot_weather(*대표[k], k), 차례)
            # strict — map 은 넣은 만큼 돌려준다. 어긋나면 열쇠가 밀려
            # **다른 마을의 예보가 이 밭에 붙는다.** 조용히 넘기면 안 된다
            for 키, 값 in zip(차례, 받은것, strict=True):
                memo[키] = 값
    except Exception:  # noqa: BLE001 — 외부 호출 경계. 최적화라 실패해도 루프가 받는다
        traceback.print_exc()
        print(
            f"[tasks] 예보 미리 받기 실패 — 밭마다 따로 받습니다"
            f" (좌표 {len(차례)}개, 받아 둔 것 {len(memo)}개)",
            flush=True,
        )


def generate_tasks_for_plot(
    db: Session,
    plot: Plot,
    water_memo: dict | None = None,
    typhoon_forecast: tuple[TyphoonPoint, ...] | None = None,
) -> list[PlotTask]:
    """밭 하나를 판정해 새 카드를 만든다. **밭의 작물을 전부 돈다**(교안 §2-B).

    **먼저 오래된 미완료 카드를 닫는다.** 순서가 중요하다 — 닫기 전에 판정하면
    그 카드가 아직 "열린 제목"이라 같은 카드의 재생성을 막는다. 사용자는 홈에서
    그 카드를 이미 못 보고 있으므로, 조건이 여전한데도 할 일이 없는 것처럼 보인다.

    닫고 난 뒤에도 살아 있는(미완료·미만료) 같은 제목의 카드가 있으면 새로 만들지
    않는다. 배치를 하루에 여러 번 돌려도 카드가 중복 쌓이지 않게 하는 장치다.

    ★ 2026-09-20 — **대표 한 건만 보던 것을 작물마다로 바꿨다.** 실측으로 작물이
      자라는 밭 12개 중 7개가 작물 둘 이상인데, `lead_growing` 이 고른 하나만
      판정하고 나머지는 **판정조차 하지 않았다.** 양파에 급한 일이 생겨도 홈은
      시금치 것만 보여 줬다.

      마이그레이션은 없다. 카드 제목이 `f"{작물이름}…"` 꼴이라 작물이 다르면
      제목이 달라, 제목으로 거르는 중복 방지가 그대로 통한다.

    ⚠ **밭 단위로 비싼 것은 루프 밖에서 한 번만 구한다.** 물수지·위성·특보·관측
      강수는 밭에 딸린 값이라 작물끼리 나눠 쓴다. 안 그러면 작물 수만큼 외부
      호출이 곱해진다(실측: 재배 1건당 148ms, 밭당 2.8초 → 4.0초로 그친 까닭).

    ⚠ **재해(기상특보) 카드는 밭에 한 장이다.** 특보는 밭에 내리는 것이지 작물에
      내리는 것이 아니다 — 첫 작물에만 `warnings` 를 넘기고 나머지에는 빈 튜플을
      준다. 제목이 같으니 중복 방지에 걸릴 것 같지만 **그것에 기대지 않는다**:
      `repo/plot_task.open_titles` 가 *"문구에 날짜·수치를 넣기 시작하면 이 방식이
      깨진다"* 고 경고한다.

      기온 카드(추위·더위)는 반대로 **작물마다** 낸다. 한계 온도가 작물별이라
      같은 밤에 시금치는 멀쩡하고 방울토마토는 상한다.
    """
    expire_stale_tasks(db, plot.id)

    # ⚠️ 아래 조기 return 들은 **만료를 커밋한 뒤** 나가야 한다. 관측소나 생육
    #    정보가 없는 밭이라고 해서 오래된 카드를 계속 열어 둘 이유는 없다.
    station = nearest_station(db, plot)
    if station is None:
        db.commit()
        _skip(plot, "관측소가 배정되지 않았습니다 — stations 마스터를 확인하세요")
        return []

    cultivations = growing_in_order(db, plot.id)
    if not cultivations:
        db.commit()
        _skip(plot, "기르는 중인 작물이 없습니다 — 밭에 작물을 등록하세요")
        return []

    # 밭 단위 값 — 작물끼리 나눠 쓴다. 한 번의 Open-Meteo 호출에서 물수지와 내일
    # 예보를 같이 꺼낸다.
    날씨 = _plot_weather(plot, water_memo)
    내일 = 날씨.tomorrow or {}
    식생 = _vegetation(db, plot)
    특보 = _active_warnings(db, plot, typhoon_forecast)
    관측비 = _recent_rain_mm(db, station.station_code)

    # "살아 있는" 카드만 재생성을 막는다 — 닫힌 카드(expired_at)는 세지 않는다.
    # 이 조건을 빠뜨리면 만료 처리 자체가 무의미해진다.
    #
    # ⚠ **만든 제목을 그 자리에서 이 집합에 넣는다.** 작물 하나만 돌 때는 없던
    #   문제다. 같은 밭에 **파종일까지 같은 재배가 실재해서**(2026-09-20 실측:
    #   풋콩 2건 · 피망 2건) 제목이 통째로 겹치는데, DB 에 유일 제약이 없어
    #   **조용히 두 장**이 꽂힌다.
    open_title_set = open_titles(db, plot.id)

    created: list[PlotTask] = []
    재해를_넘겼나 = False

    for cultivation in cultivations:
        growth = cultivation_growth(db, cultivation, station)
        if growth is None:
            # 그 작물 하나의 사정이다. 밭을 통째로 건너뛰지 않는다 — 전에는
            # 막힌 한 건이 밭의 나머지 작물까지 같이 막았다(실측 2026-09-20:
            # 디테크타워 과천의 단감 · base_temp 가 비어 있다).
            _skip(plot, f"{_crop_label(db, cultivation)} — {_why_no_growth(db, cultivation)}")
            continue

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
            recent_rain_mm=관측비,
            # 수확 — GDD 가 '때'를, 위성이 '아직 있나'를 말한다(task_rules 주석)
            gdd_target_passed=past_target(growth.accumulated_gdd, growth.gdd_target),
            sow_method=growth.sow_method,
            # 과수의 n년차. **1년차 묘목에는 수확 카드를 안 낸다** — 기점 되감기가
            #   심기 전부터 열을 쌓아 사흘 전에 심은 단감이 `꽃눈분화기` 로 나왔다
            #   (2026-09-21 실측). 한해살이는 None 이라 아무것도 안 바뀐다
            years_since_planting=growth.years_since_planting,
            vegetation=식생,
            # 이맘때 이 작물에 자주 나오는 병해충. DB 조회 한 번이라 배치를 안 늦춘다
            pest_names=pest_names_for(db, growth.crop_name_ko, kst_today()),
            # 재해 — 기상청이 판정한 것을 **받아 적기만** 한다(task_rules 주석).
            #   밭에 한 장이라 먼저 판정된 작물에만 넘긴다
            warnings=() if 재해를_넘겼나 else 특보,
            # 기온 한계 — 작물이 몇 도부터 상하나 × 내일 예보. **작물마다 다르다**
            frost_limit_c=한계.frost_c,
            heat_limit_c=한계.heat_c,
            tomorrow_temp_min=내일.get("temp_min"),
            tomorrow_temp_max=내일.get("temp_max"),
        )
        # 판정까지 간 첫 작물이 특보를 가져간다. 앞 작물이 막혔으면 다음으로 물려준다
        재해를_넘겼나 = True

        candidates = build_task_candidates(inputs)
        if not candidates:
            # 0건이 **정상인 유일한 경로**다 — 조건을 봤고 할 일이 없었다는 뜻이다.
            # 위의 건너뜀들과 섞이면 "데이터가 없다"와 "할 일이 없다"를 구분할 수 없다.
            _skip(
                plot,
                f"{growth.crop_name_ko} — 조건 미달 · 물판정 {judge_water(inputs.water)}"
                f"(14일수지 {inputs.water.balance_14d_mm}mm · 3일비 {inputs.water.rain_3d_mm}mm"
                f" · 7일비 {inputs.water.rain_7d_mm}mm)"
                f" · 관수시기 {inputs.irrigate_needed} · 재해 {inputs.stage_hazards or '없음'}"
                f" · 시비 {inputs.fertilize_needed}"
                f" · 관측 {RAIN_WINDOW_DAYS}일 강수 {inputs.recent_rain_mm}mm"
                f"(안전망 마름 기준 {DRY_MM}mm 이하)",
            )
            continue

        for candidate in candidates:
            if candidate.title in open_title_set:
                continue
            open_title_set.add(candidate.title)
            created.append(
                add_task(db, plot.id, candidate.title, candidate.reason, candidate.priority)
            )

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
    plots = all_live_plots(db)

    # ★ 밭의 격자를 `grids` 에 채운다 — 2026-09-21
    #
    #   밭 등록이 `plots.grid_x`·`grid_y` 만 넣고 `grids` 표에는 행을 안 만든다.
    #   그러면 화면이 `grid_id` 를 못 찾아 예보가 영영 안 붙는다
    #   (실측 2026-09-20: 밭 23개 중 매칭 0개).
    #
    #   ⚠ **밭 등록 때 바로 못 넣는다.** `grants_tighten.sql` 이 anon·authenticated 에
    #     `grids` select 만 준다. 권한을 열면 누구나 이 표에 쓸 수 있게 된다.
    #     그래서 service role 로 도는 이 배치가 뒤늦게 채운다.
    #
    #   ⚠ **여기가 맨 앞이다.** 아래 판정이 실패해도 격자는 들어가야 한다 — 둘은
    #     서로 상관이 없다. 실패해도 배치를 막지 않는다(밭 하나의 결손이 나머지를
    #     막지 않는다는 이 함수의 원칙과 같다).
    try:
        새격자 = sync_plot_grids(db, plots)
        if 새격자:
            db.commit()
            print(f"[tasks] grids 에 격자 {새격자}칸을 넣었습니다", flush=True)
    except Exception:  # noqa: BLE001 — 격자 적재 실패가 할 일 판정을 막지 않는다
        db.rollback()
        traceback.print_exc()

    created = 0
    # 같은 마을의 밭들이 같은 예보를 거듭 받아 오지 않게 한다. 이 배치가 끝나면
    # 사전도 같이 사라진다. 그 **뒤**를 forecast_cache 가 1시간 받친다 —
    # 손으로 배치를 다시 돌려도 그 사이에는 밖으로 안 나간다.
    water_memo: dict = {}
    # 루프에 들기 전에 좌표들을 동시에 받아 둔다. 순서대로 기다릴 이유가 없다 —
    # 1.2초는 응답 크기가 아니라 왕복 지연이다(_PREFETCH_WORKERS 주석).
    _prefetch_weather(plots, water_memo)
    # 태풍은 좌표별이 아니라 전역 하나다 — 밭마다 다시 부르지 않고 배치당 한 번만 받는다.
    태풍경로 = _fetch_typhoon_forecast()
    for plot in plots:
        try:
            created += len(generate_tasks_for_plot(db, plot, water_memo, 태풍경로))
        except Exception:
            db.rollback()
            traceback.print_exc()
            print(f"[tasks] 밭 {plot.id} 판정 실패 — 건너뛰고 계속합니다", flush=True)

    return created
