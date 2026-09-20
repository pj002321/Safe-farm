"""재배 한 건의 작업카드. **화면이 이미 판정해 둔 값을 받아 판정만 한다.**

재배 상세 화면에도 `할 일` 이 있었는데 홈과 **판정이 따로였다**(Next 의
`src/shared/growth/taskAdvice.ts` — 단계 이름 글자 + 최근 3일 강수, 임계값은
33도·5mm 고정). 임계값이 갈려서 실제로 반대되는 조언이 나갔다 — 추수 3주 전
물을 뺀 논에 홈은 조용한데 상세가 "뿌리까지 젖도록 충분히 주기" 를 냈다.

판정을 한 벌로 모은다. `build_task_candidates` 는 원래 순수 함수라 값이 밭에서
왔는지 재배에서 왔는지 모른다 — 밭 단위인 것은 판정이 아니라 **값을 모으는 쪽**
(`plot_tasks.generate_tasks_for_plot`)이었다. 그래서 값을 모으는 길만 하나 더 낸다.

⚠ **저장하지 않는다.** `plot_tasks` 에 안 들어간다. 홈 카드는 자정 배치가 만드는
  것이고 이쪽은 화면이 볼 때마다 새로 내는 계산값이다. 섞으면 같은 일이 카드
  두 장이 되고, `했음` 이 어느 쪽을 가리키는지 알 수 없어진다.

⚠ **GDD 를 다시 계산하지 않는다.** 화면이 넘겨준 누적 GDD 를 그대로 믿는다.
  사용자가 "단계가 실제와 다른가요?" 로 보정(rebase)한 재배가 있는데 **서버는
  그 보정을 모른다** — 다시 계산하면 화면은 "줄기비대기" 인데 카드는 "수확기"
  근거로 말한다. 다시 계산하는 쪽이 오히려 틀린다.

⚠ **밭 단위 값은 받지 않는다.** 물수지·위성·특보·병해충·기온한계·관측강수는
  `plot_id` 로 서버가 직접 읽는다. 받으면 남의 밭을 훔쳐볼 통로가 된다.
  받는 것은 **그 재배를 가리키는 식별자와 화면이 센 숫자**뿐이다.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.gdd import past_target
from app.domain.kst import kst_today
from app.domain.task_rules import PlotTaskInputs, TaskCandidate, build_task_candidates
from app.models.farm import Plot
from app.repo.crop import stage_by_order, usable_crop_of_variant, variant_by_id
from app.service.crop_hazard import temp_limits_for
from app.service.pest_notes import pest_names_for
from app.service.plot_growth import _split, nearest_station

# ⚠ **밑줄 헬퍼를 일부러 가져다 쓴다.** 값을 모으는 방법이 홈과 한 글자도 달라지면
#   안 되는 자리다 — 베껴 오면 한쪽만 고쳐졌을 때 두 화면이 또 갈린다(이 파일이
#   생긴 이유가 바로 그것이다). 대신 이름이 바뀌면 조용히 깨지므로
#   `tests/test_cultivation_tasks_helpers.py` 가 import 되는지 기계로 지킨다.
from app.service.plot_tasks import (
    _active_warnings,
    _plot_weather,
    _recent_rain_mm,
    _vegetation,
)

#: 화면이 보내 온 누적 GDD 의 상한. 이 위는 받지 않는다.
#:
#: 실측(2026-09-20) 마스터의 최대 목표 GDD 는 네 자리다. 다섯 자리는 단위가
#: 어긋났거나 손으로 고친 주소라 보고, **그 값으로 판정하느니 판정을 안 한다** —
#: 근거를 못 만들면 침묵한다는 `task_rules` 의 선과 같다.
MAX_GDD = 100_000.0


def _finite(value: float | None, limit: float) -> float | None:
    """유한하고 0 이상 `limit` 이하인 수만 통과. 아니면 None(그 근거를 안 씀)."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):  # NaN·무한
        return None
    return number if 0.0 <= number <= limit else None


def tasks_for_cultivation(
    db: Session,
    plot: Plot,
    variant_id: int,
    stage_order: int | None,
    accumulated_gdd: float | None,
) -> list[TaskCandidate]:
    """
    # summary
    재배 한 건의 작업카드 후보. 홈 배치와 **같은 판정 함수**를 쓴다.

    단계 이름·시기 플래그(관수·시비·재해·농작업)와 작물 이름·심는 법은 여기서
    마스터 표를 읽어 채운다. 화면에서 받지 않는 까닭은 그 값들이
    `crop_stages`·`crop_variants` 에 이미 있어서다 — 받으면 믿을 근거가 하나 늘
    뿐이고, 읽으면 조회 두 번으로 끝난다(둘 다 `request_cache` 에 얹힌다).

    # params
    db: 세션<br>
    plot: 이 재배가 있는 밭. 소유 확인은 부르는 쪽(Next)이 이미 했다<br>
    variant_id: 숙기 id. 작물 이름 · 심는 법 · 단계표를 이걸로 읽는다<br>
    stage_order: 화면이 판정한 단계 번호(보정이 반영된 값). 못 정했으면 None —
        그때는 시기 근거 없이 기상만으로 판정한다<br>
    accumulated_gdd: 화면이 센 누적 GDD. 이상한 수면 버린다(`MAX_GDD`)<br>

    # returns
    TaskCandidate 목록. 0건은 **정상**이다 — 조건을 봤고 할 일이 없었다는 뜻이다.
    작물 마스터를 못 읽으면(기준온도 없음 등) 역시 빈 목록이다

    # examples
        tasks_for_cultivation(db, plot, 12, 3, 771.8)
        -> [TaskCandidate(title='감자밭 물 주기', ..., priority='high')]
    """
    crop = usable_crop_of_variant(db, variant_id)
    if crop is None:
        # 기준온도가 없는 작물·없는 숙기. 생육 근거가 없으니 판정도 안 한다.
        return []

    variant = variant_by_id(db, variant_id)
    stage = None if stage_order is None else stage_by_order(db, variant_id, stage_order)

    station = nearest_station(db, plot)
    날씨 = _plot_weather(plot)
    내일 = 날씨.tomorrow or {}
    한계 = temp_limits_for(db, crop.name)

    누적 = _finite(accumulated_gdd, MAX_GDD)
    목표 = variant.gdd_target if variant else None

    inputs = PlotTaskInputs(
        crop_name_ko=crop.name,
        stage_name=stage.stage_name if stage else None,
        # 시기 — crop_stages. 단계를 못 정했으면 전부 빈 값이라 기상 카드만 남는다
        irrigate_needed=bool(stage.irrigate_needed) if stage else False,
        stage_hazards=_split(stage.stage_hazards) if stage else (),
        stage_tasks=_split(stage.stage_tasks) if stage else (),
        fertilize_needed=bool(stage.fertilize_needed) if stage else False,
        # 사정 — 기상. 못 만들면 빈 값이라 물 카드가 안 나온다(시비는 그대로 나간다)
        water=날씨.water,
        # 관측소가 없는 밭은 관측 강수 근거만 빠진다. 나머지 카드는 그대로 나간다
        recent_rain_mm=None if station is None else _recent_rain_mm(db, station.station_code),
        # 수확 — GDD 가 '때'를, 위성이 '아직 있나'를 말한다
        # 누적을 못 믿으면 "아직 아니다" 가 아니라 "모른다" 다. `past_target` 이
        # 목표를 모를 때 고른 쪽과 같게, 아무 말도 안 하는 쪽으로 떨어뜨린다
        gdd_target_passed=past_target(누적, 목표) if 누적 is not None else False,
        sow_method=variant.sow_method if variant else None,
        vegetation=_vegetation(db, plot),
        pest_names=pest_names_for(db, crop.name, kst_today()),
        # 재해 — 기상청이 판정한 것을 받아 적기만 한다
        warnings=_active_warnings(db, plot),
        frost_limit_c=한계.frost_c,
        heat_limit_c=한계.heat_c,
        tomorrow_temp_min=내일.get("temp_min"),
        tomorrow_temp_max=내일.get("temp_max"),
    )
    return build_task_candidates(inputs)
