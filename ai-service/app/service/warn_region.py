"""시군구 단위 기상특보 발효 현황 조회. F4(재해 경보)의 지역 집계 버전(V1-39).

판정 로직은 app/domain/warn_region.py(순수 함수), 이 파일은 DB에서 값을 모아 넘겨주기만 한다.
"""

from __future__ import annotations

import csv
from datetime import datetime
from functools import lru_cache

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import DATA_DIR
from app.domain.warn_region import active_wrn_kinds, ancestors, classify_warning
from app.models.alert import OfficialAlert
from app.service.sigungu_ref import sigungu_code_at

# 참조 CSV. 예전엔 api/map.py 가 들고 있었는데, 특보를 보는 곳이 지도 말고
# 밭 예보(/v1/weather/plot)에도 생기면서 라우터 모듈에 둘 이유가 없어졌다.
# 배포 중 바뀌지 않는 참조 데이터라 요청마다 읽지 않고 한 번만 읽는다.
WARN_REGION_MAP_PATH = DATA_DIR / "ref" / "sigungu_warn_region.csv"
WARN_REGIONS_PATH = DATA_DIR / "warn_regions.csv"


@lru_cache(maxsize=1)
def sigungu_warn_regions() -> tuple[dict, ...]:
    """시군구 코드 ↔ 특보 구역(reg_id) 대응표."""
    with WARN_REGION_MAP_PATH.open(encoding="utf-8") as f:
        return tuple(csv.DictReader(f))


@lru_cache(maxsize=1)
def warn_region_up_by_id() -> dict[str, str]:
    """특보 구역의 상위 구역. 시군구에 직접 걸린 특보가 없어도 상위(도·광역)에
    걸린 특보는 그 아래 전체에 해당하므로 거슬러 올라가야 한다."""
    with WARN_REGIONS_PATH.open(encoding="utf-8-sig") as f:
        return {row["reg_id"]: row["reg_up"] for row in csv.DictReader(f)}


def _latest_active_alerts(db: Session) -> tuple[list[dict], datetime | None]:
    """가장 최근 배치 스냅샷(fetched_at 최댓값)의 발효 중(CMD≠해제) 특보와 그 스냅샷 시각.

    official_alerts 는 append-only 라 예전 스냅샷이 계속 쌓인다 — 최신 한 번만 봐야
    해제된 특보가 계속 잡히지 않는다.
    """
    latest = db.execute(select(func.max(OfficialAlert.fetched_at))).scalar()
    if latest is None:
        return [], None

    rows = db.execute(
        select(OfficialAlert.reg_id, OfficialAlert.wrn).where(
            OfficialAlert.fetched_at == latest, OfficialAlert.cmd != "해제"
        )
    ).all()
    return [{"reg_id": reg_id, "wrn": wrn} for reg_id, wrn in rows], latest


def sigungu_warning_status(
    db: Session, sigungu_warn_regions: list[dict], reg_up_by_id: dict[str, str]
) -> tuple[dict[str, dict], datetime | None]:
    """(시군구 코드 → {regId, warnings, color, label}, 최신 스냅샷 시각).

    특보가 없으면 color/label 은 None. 스냅샷이 아예 없으면 시각도 None.
    """
    alerts, as_of = _latest_active_alerts(db)

    out: dict[str, dict] = {}
    for row in sigungu_warn_regions:
        reg_id = row["reg_id"]
        reg_ids = set(ancestors(reg_id, reg_up_by_id))
        wrn_kinds = active_wrn_kinds(reg_ids, alerts)
        color, label = classify_warning(wrn_kinds)

        out[row["sigungu_code"]] = {
            "regId": reg_id,
            "warnings": wrn_kinds,
            "color": color,
            "label": label,
        }
    return out, as_of


def plot_warning(db: Session, lat: float, lon: float) -> tuple[dict | None, datetime | None]:
    """밭 좌표에 지금 걸려 있는 특보. 좌표가 어느 시군구에도 안 걸리면 (None, 시각).

    ⚠️ **`plots.region_code` 앞 5자리를 쓰지 말 것.** 한 번 그렇게 냈다가 고쳤다.
       `region_code` 는 카카오의 **법정동 코드**이고 특보 표의 키는
       **통계청 행정구역코드**라, 두 공간은 겹치지 않는다:
         · 법정동 41000~50999(경기~제주, 사실상 전 농지)는 통계청 표에 아예 없다
           → `.get()` 이 조용히 None → 호우경보가 떠 있어도 카드가 안 뜬다.
         · 울산(법정동 31xxx)은 통계청의 경기도(31xxx)와 **겹친다**
           → 울산 밭에 과천·오산·의왕 특보가 붙는다. 예외도 로그도 없다.
       재해 경보 화면에서 이건 "경보 없음"으로 읽히므로 실제 피해로 이어진다.
       코드로 잇지 말고 좌표로 찾는다(`sigungu_ref.sigungu_code_at`).

    전국 250개를 다 계산한 뒤 하나만 꺼내는 이유: 특보 스냅샷 조회는 어차피 한 번이고
    나머지는 메모리 위 루프라, 시군구 하나만 도는 경로를 따로 두면 같은 판정 로직이
    둘이 된다(그 둘이 어긋나면 지도와 날씨 화면이 서로 다른 말을 하게 된다).
    """
    status_by_code, as_of = sigungu_warning_status(
        db, list(sigungu_warn_regions()), warn_region_up_by_id()
    )
    code = sigungu_code_at(lat, lon)
    if code is None:
        return None, as_of
    return status_by_code.get(code), as_of
