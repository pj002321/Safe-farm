"""기상특보 지역 판정 순수 함수. 시군구 지도(V1-39)의 지역 집계 버전.

DB·네트워크 의존 없음 — `app/service/warn_region.py` 가 DB에서 값을 가져와 여기 함수로
판정만 시킨다(`app/domain/gdd.py` 와 같은 역할 분담).
"""

from __future__ import annotations

# 1차에서 뺀 특보 종류(DOMAIN_REF §4-2 Y·F). 안개·황사는 재해 판정과 무관해 제외.
_EXCLUDED_WRN = {"안개", "황사"}

WARNING_COLOR = "#dc2626"
# 프론트가 이 값이면 폴리곤 자체를 안 그린다 — 전국 대부분이 해당하는 게 정상이라서다.
NO_WARNING_COLOR = None


def ancestors(reg_id: str, reg_up_by_id: dict[str, str]) -> list[str]:
    """특보구역 자기 자신 + 상위 구역 전부. 상위 특보는 하위에도 적용된다(DOMAIN_REF §4-5).

    상주 → ["L1071200", "L1070000", "L1000000"]
    """
    out, cur = [reg_id], reg_id
    while True:
        up = reg_up_by_id.get(cur)
        if not up or up == "00000000" or up == cur:
            break
        out.append(up)
        cur = up
    return out


def active_wrn_kinds(reg_ids: set[str], alerts: list[dict]) -> list[str]:
    """`reg_ids`(자기+상위) 중 하나라도 걸린 발효 중 특보의 종류(중복 제거, 등장 순서 유지)."""
    seen: list[str] = []
    for alert in alerts:
        if alert["reg_id"] not in reg_ids:
            continue
        wrn = alert["wrn"]
        if not wrn or wrn in _EXCLUDED_WRN:
            continue
        if wrn not in seen:
            seen.append(wrn)
    return seen


def classify_warning(wrn_kinds: list[str]) -> tuple[str | None, str | None]:
    """(색상, 라벨). 발효 중인 특보가 없으면 (None, None) — 지도에 아예 안 그린다."""
    if not wrn_kinds:
        return NO_WARNING_COLOR, None
    return WARNING_COLOR, "·".join(wrn_kinds) + " 특보"
