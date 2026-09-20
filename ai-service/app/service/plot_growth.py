"""필지 하나의 누적 GDD·생육단계 계산. ask_context.py(LLM 프롬프트용 문장)와 작업카드
생성·필지 요약 스트립(구조화된 값이 필요한 곳)이 같이 쓴다 — 계산은 여기 한 곳에서만
하고, 나머지는 이 결과를 문장으로 조립하거나 화면에 얹기만 한다.

계산식 자체(daily_gdd)는 app/domain/gdd.py 순수 함수. 여기는 DB에서 파종일·관측·
작물 마스터를 모아 그 함수에 먹이기만 한다.

작물·파종일은 plots 가 아니라 cultivations 에 있다(20260916010000_plots_drop_crop_columns.sql
이후). 한 밭에 여러 재배 건이 있을 수 있다.

    compute_plot_growth      대표 한 건(가장 먼저 심은 것) — 리포트·/ask·밭 요약
                             ask_context.py 의 `_lead` 와 같은 기준이다
    cultivation_growth       건 하나를 지정해서 — 작업카드가 재배마다 돈다(교안 §2-B)

⚠ **대표만 보면 나머지 작물은 판정조차 안 된다.** 실측 2026-09-20: 작물이 자라는
  밭 12개 중 **7개가 작물 둘 이상**이고, 양파에 급한 일이 생겨도 홈은 시금치 것만
  보여 줬다. 그래서 작업카드 쪽이 `cultivation_growth` 로 갈라져 나갔다.
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
    stage_count_and_last_order,
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
    # 심는 법('씨뿌림'·'아주심기' …). 작업카드가 **거둬도 밭에 남는 작물**을 가르는
    # 데 쓴다(task_rules.harvest_clears_field).
    #
    # ★ 2026-09-20 — **과수는 `발아`·`개화` 가 온다.** 전에는 빈 칸이었다. 그 해의
    #   0일이 파종이 아니라 기점이라는 표시이고, `sow_from`~`sow_to` 도 파종 창이
    #   아니라 **기점 창**이다(crop-data `build._파종방법`).
    #   ⚠ `harvest_clears_field` 는 그대로 맞다 — 둘 다 `_PLANTING_METHODS` 에
    #     없으므로 여전히 "거둬도 밭에 남는다" 로 판정된다.
    sow_method: str | None = None
    # 나무를 심은 지 몇 해째인가. **과수만 채운다**(한해살이는 None).
    #
    # ⚠ 보여 주기만 한다. 어린나무에서 수확 예측을 감추려면 작물별 **결실 시작
    #   나이**가 있어야 하는데 마스터에 없다 — 지어내지 않는다(이슈로 남김).
    years_since_planting: int | None = None
    # 과수가 그 해 수확을 끝내고 다음 기점을 기다리는 중인가. **과수만 참이 된다.**
    #
    # ★ `crop_stages` 는 기점~수확까지만 담는다(교안 §3-2). 겨울은 GDD 가 0이라
    #   구간으로 못 재기 때문이다 — 실측으로 감귤 101일·유자 131일·단감 130일이
    #   모두 GDD 0 이었다. 그래서 **수확 뒤는 DB 에 줄이 없고 여기서 판정한다.**
    #
    # ⚠ **`stage_name is None` 과 뜻이 다르다.** 저건 "단계를 못 찾았다" 이고
    #   이건 "찾을 단계가 없는 것이 정상이다" 다. 화면이 둘을 섞으면 한 해의
    #   절반을 "자료가 없습니다" 로 말하게 된다.
    after_harvest: bool = False
    # 지금 단계가 단계표의 마지막인가. '수확' 이라는 낱말을 믿어도 되는지 가른다 —
    # 여러 번 거두는 작물은 수확이 중간에 온다(고추: 풋고추 → 붉은고추).
    is_last_stage: bool = False
    # 이 품종의 단계 수. 하나뿐이면 단계 이름에 시기 정보가 없다(상추: '수확' 한 칸)
    stage_count: int = 0


def _split(value: str | None) -> tuple[str, ...]:
    """쉼표로 이은 칸을 튜플로. 빈 칸·None 은 빈 튜플이다.

    ⚠ 빈 조각을 버린다 — 'a,,b' 나 끝의 쉼표가 빈 문자열을 만들면 `'' in hazards` 같은
      검사가 엉뚱하게 참이 된다.
    """
    if not value:
        return ()
    return tuple(x.strip() for x in value.split(",") if x.strip())


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


#: 이 값이 `crop_variants.sow_method` 에 있으면 **과수**다.
#:
#: ⚠ 작물 이름 목록을 두지 않는다 — 마스터가 이미 표시해 준다. 이름 목록은 늘 낡는다.
FRUIT_METHODS = frozenset({"발아", "개화"})


def is_fruit(sow_method: str | None) -> bool:
    """과수인가. `crop_variants.sow_method` 한 칸으로 가른다."""
    return (sow_method or "") in FRUIT_METHODS


def _중앙일(_from: str | None, _to: str | None) -> tuple[int, int] | None:
    """'MM-DD' 두 개로 된 창의 **가운데 날**. 한쪽만 있으면 그쪽을 쓴다.

    ⚠ **왜 가운데인가.** crop-data 가 `gdd_target` 을 만들 때 쓴 기준일이 창의
      중앙일이다(`build._작형_일정` 의 `파종일`). 목표는 중앙일 기준인데 누적을
      창 시작이나 끝에서 세면 **분자와 분모의 기준이 달라진다.**
    """
    def 읽기(md):
        try:
            m, d = (md or "").split("-")
            return int(m), int(d)
        except (ValueError, AttributeError):
            return None

    a, b = 읽기(_from), 읽기(_to)
    if a is None:
        return b
    if b is None:
        return a
    올 = date(2000, *a)
    끝 = date(2000, *b)
    if 끝 < 올:                            # 해를 넘는 창. 지금 과수엔 없지만 막아 둔다
        끝 = date(2001, *b)
    가운데 = 올 + (끝 - 올) / 2
    return 가운데.month, 가운데.day


def _과수기점일(variant, 오늘: date) -> date | None:
    """과수의 **그 해 기점일**. 아직 안 왔으면 작년 것이다.

    ⚠ **해마다 0으로 되감긴다.** 나무는 몇 해 전에 심었으므로 `sowing_date` 부터
      쌓으면 여러 해치 열이 누적된다 — 5년 전에 심은 사과가 gdd_target 을 첫해에
      넘어 영영 '수확' 에 머문다.

    ⚠ 1~3월처럼 **올해 기점이 아직 안 온 때**는 작년 기점부터 쌓는다. 그래야
      수확이 늦은 과수(감귤 12월)가 해를 넘겨도 끊기지 않는다.
    """
    md = _중앙일(getattr(variant, "sow_from", None), getattr(variant, "sow_to", None))
    if md is None:
        return None
    올해 = date(오늘.year, *md)
    return 올해 if 올해 <= 오늘 else date(오늘.year - 1, *md)


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
    """밭의 **대표** 재배 건을 골라 파종일부터 오늘까지 GDD 를 누적, 현재 생육단계를
    계산한다. 기르는 중인 재배 건이 없거나 파종일·base_temp 를 모르면 None.

    ⚠ 밭의 **모든** 작물을 봐야 하면 `cultivation_growth` 를 재배마다 부른다.
      이 함수는 대표 하나라, 나머지 작물은 판정조차 되지 않는다.
    """
    cultivation = lead_growing(db, plot.id)
    if cultivation is None:
        return None
    return cultivation_growth(db, cultivation, station)


def cultivation_growth(
    db: Session, cultivation: Cultivation, station: StationRow
) -> PlotGrowth | None:
    """
    # summary
    **재배 건 하나**의 누적 GDD 와 생육단계. 대표를 고르지 않는다.

    부르는 쪽이 이미 재배 건을 손에 쥔 경우다 — 작업카드가 한 밭의 작물을 차례로
    돌면서 판정한다(교안 §2-B). 밭을 다시 읽지 않으므로 같은 밭을 여러 번 돌아도
    조회가 밭 수만큼 늘지 않는다.

    # params
    db: 세션<br>
    cultivation: 기르는 중인 재배 건. 상태·삭제 확인은 repo 가 이미 했다<br>
    station: 관측을 읽을 관측소. 밭 단위라 부르는 쪽이 한 번만 찾는다<br>

    # returns
    PlotGrowth 또는 None. **None 인 까닭은 셋이고 전부 그 재배 건의 사정이다** —
    파종일이 없거나 · 작물을 못 찾거나 · base_temp 가 비었다. 밭의 문제가 아니므로
    부르는 쪽은 그 건만 건너뛰고 나머지 작물을 계속 봐야 한다

    # examples
        cultivation_growth(db, 고추재배, station)  -> None   # 파종일이 없다
    """
    if cultivation.sowing_date is None:
        return None

    crop = usable_crop_of_variant(db, cultivation.variant_id)
    if crop is None:
        return None

    variant = variant_by_id(db, cultivation.variant_id)
    오늘 = date.today()

    # ★ 과수는 **해마다 0에서 다시 쌓는다** — 2026-09-20 (`교안_과수를_살린다.md`)
    #
    #   나무는 몇 해 전에 심어서 `sowing_date` 부터 쌓으면 여러 해치 열이 누적된다.
    #   그 해의 0일은 **기점**(발아, 없으면 개화)이고 날짜는 마스터에 있다.
    #   `sowing_date` 는 그대로 **심은 날**로 남아 n년차를 센다.
    #
    #   ⚠ 기점을 못 찾으면(창이 빈 품종) 옛 길로 떨어진다. 그 작물은 어차피
    #     gdd_target 도 비어 게이지가 안 뜬다 — 조용히 틀리는 것보다 낫다.
    과수 = variant is not None and is_fruit(variant.sow_method)
    기점 = _과수기점일(variant, 오늘) if 과수 else None
    시작일 = 기점 or cultivation.sowing_date

    obs = temps_since(db, station.station_code, 시작일)
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    # ⚠ 과수에는 `_start_gdd`(모종 보정)를 얹지 않는다. 그건 "씨 대신 모종으로
    #   시작했으니 앞 단계를 건너뛴다" 는 뜻인데, 과수는 해마다 기점에서 0으로
    #   되감기므로 건너뛸 앞 단계가 없다.
    누적시작 = 0.0 if 과수 else _start_gdd(db, cultivation)
    accumulated = 누적시작 + sum(
        daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper) for o in obs
    )

    stage = stage_at_gdd(db, cultivation.variant_id, accumulated)

    # 과수가 목표를 넘겨 단계표 밖으로 나갔으면 **수확 뒤**다. 다음 기점일에
    # 되감기면 다시 1단계로 돌아온다 — 고리가 여기서 닫힌다.
    #
    # ⚠ `stage is None` 만으로는 못 가른다. 단계표가 아예 없는 작물도 None 이다.
    #   목표를 넘었다는 것까지 봐야 "끝나서 없는 것" 이 된다.
    목표 = variant.gdd_target if variant is not None else None
    수확뒤 = bool(과수 and stage is None and 목표 is not None and accumulated >= float(목표))

    # 지금 단계가 **단계표의 마지막인가.**
    #
    # ⚠ 이것이 있어야 '수확' 이라는 낱말을 믿을 수 있다. 여러 번 거두는 작물은
    #   수확이 중간에 온다 — 고추가 `풋고추 수확 → 붉은고추 수확` 이고, 그동안
    #   나무는 계속 자란다. 마지막인지 안 보고 '수확' 만으로 "익어 가는 중" 이라
    #   판정하면, **여름 가뭄으로 잎이 마르는 것을 자연스러운 변화라고 덮는다.**
    #   (2026-09-19 실측: 단계표에 '수확' 이 마지막이 아닌 품종이 여럿이다)
    #
    # ⚠ 개수도 같이 센다. **단계가 하나뿐이면 이름에 시기 정보가 없다** — 상추가
    #   '수확' 한 칸(GDD 0~573)이라 심은 날부터 '마지막 수확 단계' 가 된다.
    #   그대로 두면 32% 자란 상추가 "익어 가는 중" 으로 읽힌다(vegetation_text 주석).
    stage_count, last_order = stage_count_and_last_order(db, cultivation.variant_id)

    return PlotGrowth(
        cultivation_id=cultivation.id,
        crop_name_ko=crop.name,
        # ⚠ 과수는 **기점부터** 센다. 심은 날부터 세면 "심은 지 1,825일" 이 되어
        #   그 해의 생육을 말하지 못한다. n년차는 아래 칸이 따로 나른다.
        days_since_planting=(오늘 - 시작일).days,
        # 과수만. 한해살이는 None 이다 — `sowing_date` 가 곧 그 해의 시작이라 뜻이 없다
        years_since_planting=(오늘.year - cultivation.sowing_date.year + 1) if 과수 else None,
        after_harvest=수확뒤,
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
        sow_method=variant.sow_method if variant else None,
        stage_gdd_to=stage.gdd_to if stage else None,
        is_last_stage=bool(stage and last_order is not None and stage.stage_order == last_order),
        stage_count=int(stage_count or 0),
    )
