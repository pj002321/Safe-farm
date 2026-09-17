"""시군구 강수량·바람 순수 판정 함수. `app/domain/gdd.py` 와 같은 역할 분담 —
DB 조회는 `app/service/weather_region.py` 가 하고 여기는 값 → (색상, 라벨) 만 정한다.
"""

from __future__ import annotations

NO_DATA_COLOR = "#d1d5db"
NO_RAIN_COLOR = "#dbeafe"

_RAIN_TIERS: list[tuple[float, str, str]] = [
    (10.0, "#93c5fd", "약한 비"),
    (30.0, "#3b82f6", "보통 비"),
    (80.0, "#f97316", "강한 비"),
    (float("inf"), "#dc2626", "매우 강한 비"),
]

# 강풍주의보(14m/s)·강풍경보(21m/s) 근사 경계.
_WIND_TIERS: list[tuple[float, str, str]] = [
    (4.0, "#a7f3d0", "약함"),
    (9.0, "#6ee7b7", "약간 강함"),
    (14.0, "#fdba74", "강함"),
    (21.0, "#f97316", "강풍주의보 수준"),
    (float("inf"), "#dc2626", "강풍경보 수준"),
]


def classify_rain(rain_mm: float | None) -> tuple[str, str]:
    """(색상, 라벨). 값이 없으면 회색, 0 이하는 옅은 파랑으로 "강수 없음"과 구분한다."""
    if rain_mm is None:
        return NO_DATA_COLOR, "데이터 없음"
    if rain_mm <= 0:
        return NO_RAIN_COLOR, "강수 없음"
    for threshold, color, label in _RAIN_TIERS:
        if rain_mm < threshold:
            return color, label
    return _RAIN_TIERS[-1][1], _RAIN_TIERS[-1][2]


def classify_wind(wind_max: float | None) -> tuple[str, str]:
    """(색상, 라벨). 값이 없으면 회색."""
    if wind_max is None:
        return NO_DATA_COLOR, "데이터 없음"
    for threshold, color, label in _WIND_TIERS:
        if wind_max < threshold:
            return color, label
    return _WIND_TIERS[-1][1], _WIND_TIERS[-1][2]
