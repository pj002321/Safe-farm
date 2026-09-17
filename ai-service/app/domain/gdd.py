"""적산온도(GDD) 순수 계산. `src/features/report/domain/gdd.ts` 의 하루치 공식과 동일하게 맞춘다.

DB·네트워크 의존 없음 — `app/service/gdd_region.py` 가 DB에서 값을 가져와 여기 함수로 계산만 시킨다.
"""

from __future__ import annotations

# 특정 작물이 아니라 지역 전체를 보여주는 지도라 작물별 기준온도(CROP.baseTempC)를
# 쓸 수 없다. 온대작물 일반 생육 하한에 가까운 5.0℃로 고정 — 작물별 지도가
# 필요해지면 그때 쿼리 파라미터로 뺀다.
BASE_TEMP_C = 5.0

# 평년 대비 편차(%) 4단계 경계 — 실측 분포 없이 잡은 1차 값(선행 작업 시점에 "자리만
# 잡음"으로 미뤄둔 부분). 실제 편차 분포가 쌓이면 재조정한다.
_TIERS: list[tuple[float, str, str]] = [
    (-10.0, "#2563eb", "평년보다 낮음"),
    (0.0, "#93c5fd", "평년과 비슷(낮은 쪽)"),
    (10.0, "#fdba74", "평년과 비슷(높은 쪽)"),
    (float("inf"), "#dc2626", "평년보다 높음"),
]
NO_DATA_COLOR = "#d1d5db"


def station_plot_id(stn: str) -> str:
    """weather_daily 는 plot_id 로 키가 잡혀 있어 텃밭 전용이다. 관측소 자체 데이터를
    담을 테이블을 새로 만드는 대신 이 합성 키로 같은 테이블을 재사용한다
    (pipeline/fetch_region_weather.py 가 적재, app/service/gdd_region.py 가 조회할 때
    둘 다 이 규칙을 쓴다).
    """
    return f"stn:{stn}"


def daily_gdd(
    tmax_c: float,
    tmin_c: float,
    base_temp_c: float = BASE_TEMP_C,
    upper_temp_c: float | None = None,
) -> float:
    """하루치 적산온도. 기준온도 아래로 내려간 날은 0(음수를 빼지 않는다).

    upper_temp_c 가 있으면 그 이상은 생장에 더 기여하지 않는다고 보고 캡을 건다
    (예: base=5, upper=30 인 작물은 평균기온이 아무리 높아도 하루 25 이상 못 쌓는다).
    """
    raw = (tmax_c + tmin_c) / 2 - base_temp_c
    if upper_temp_c is not None:
        raw = min(raw, upper_temp_c - base_temp_c)
    return max(0.0, raw)


def classify_deviation(deviation_pct: float | None) -> tuple[str, str]:
    """(색상, 라벨). 데이터가 없으면 회색."""
    if deviation_pct is None:
        return NO_DATA_COLOR, "데이터 없음"
    for threshold, color, label in _TIERS:
        if deviation_pct < threshold:
            return color, label
    return _TIERS[-1][1], _TIERS[-1][2]
