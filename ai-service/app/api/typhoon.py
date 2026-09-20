"""진행 중인 태풍 경로(지도 레이어용). DB 를 안 탄다 — 발표가 하루 4번뿐이라
그때그때 기상청을 부르고 캐시는 프런트의 revalidateSec(1시간)에 맡긴다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import KMA_API_KEY
from app.core.security import require_service_token
from app.domain.typhoon import TyphoonPoint, split_track
from app.service.typhoon_cache import track as typhoon_track

router = APIRouter(prefix="/v1/typhoon", tags=["typhoon"])


def _point_json(p: TyphoonPoint) -> dict:
    """camelCase 로 낸다 — 이 레포의 지도 응답은 전부 camelCase 다(gdd_region.py 참고)."""
    return {
        "ft": p.ft,
        "atUtc": p.at_utc,
        "lat": p.lat,
        "lon": p.lon,
        "pressureHpa": p.pressure_hpa,
        "windMs": p.wind_ms,
        "rad15Km": p.rad15_km,
        "forecastRadiusKm": p.forecast_radius_km,
        "locationKo": p.location_ko,
    }


@router.get("/track", dependencies=[Depends(require_service_token)])
def track() -> dict:
    """지금 진행 중인 태풍의 분석·예측 경로.

    태풍이 없으면 200 에 빈 배열이다 — 404 가 아니다.
    "없음" 은 오류가 아니라 **평상시의 정상 상태**이고, 프런트가 레이어를 감추면 된다.
    """
    if not KMA_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="KMA_API_KEY 가 설정되지 않았습니다.",
        )
    try:
        rows = typhoon_track(KMA_API_KEY)
    except Exception as exc:  # noqa: BLE001 — 외부 API 장애를 502 로 환원
        raise HTTPException(status_code=502, detail=f"태풍 조회 실패: {exc}") from exc

    analysis, forecast = split_track(rows)
    return {
        "typhoonNo": rows[0]["typ_no"] if rows else None,
        "analysis": [_point_json(p) for p in analysis],
        "forecast": [_point_json(p) for p in forecast],
    }
