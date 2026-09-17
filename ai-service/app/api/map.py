"""시군구 경계 + 누적 GDD 평년 대비 편차(V1-37) · 기상특보 발효 현황(V1-39)을 얹은 GeoJSON.

정적 파일(sigungu.geojson, sigungu_station.csv, warn_regions.csv 등)은 요청마다 안 읽고
lru_cache 로 한 번만 읽는다 — 배포 중 파일이 바뀔 일이 없는 참조 데이터라서다.
"""

from __future__ import annotations

import csv
import json
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import DATA_DIR
from app.core.db import get_db
from app.core.security import require_service_token
from app.service.gdd_region import sigungu_gdd_deviation
from app.service.warn_region import (
    sigungu_warn_regions,
    sigungu_warning_status,
    warn_region_up_by_id,
)
from app.service.weather_region import sigungu_rain_levels, sigungu_wind_levels

router = APIRouter(prefix="/v1/map", tags=["map"])

SIGUNGU_PATH = DATA_DIR / "ref" / "sigungu.geojson"
STATION_MAP_PATH = DATA_DIR / "ref" / "sigungu_station.csv"


@lru_cache(maxsize=1)
def _sigungu_geojson() -> dict:
    return json.loads(SIGUNGU_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _sigungu_stations() -> tuple[dict, ...]:
    with STATION_MAP_PATH.open(encoding="utf-8") as f:
        return tuple(csv.DictReader(f))


def _with_properties(properties_by_code: dict[str, dict], as_of: str | None) -> dict:
    features = []
    for feature in _sigungu_geojson()["features"]:
        code = feature["properties"]["code"]
        properties = {**feature["properties"], **properties_by_code.get(code, {})}
        features.append({**feature, "properties": properties})
    return {"type": "FeatureCollection", "asOf": as_of, "features": features}


@router.get("/sigungu-gdd", dependencies=[Depends(require_service_token)])
def sigungu_gdd(db: Session = Depends(get_db)) -> dict:
    """시군구 250개 폴리곤 각각에 올해 누적 GDD·평년 대비 편차·색상을 얹어 GeoJSON으로 돌려준다."""
    today = date.today()
    deviation_by_code = sigungu_gdd_deviation(db, list(_sigungu_stations()), today)
    return _with_properties(deviation_by_code, today.isoformat())


@router.get("/sigungu-warn", dependencies=[Depends(require_service_token)])
def sigungu_warn(db: Session = Depends(get_db)) -> dict:
    """시군구 250개 폴리곤 각각에 발효 중인 기상특보 종류·경고색을 얹어 GeoJSON으로 돌려준다.

    특보가 없는 시군구는 color 가 없다 — 대부분의 날엔 전국이 이 상태라, GDD 지도처럼
    항상 색을 칠하면 오히려 눈에 안 띈다.
    """
    warn_regions = list(sigungu_warn_regions())
    status_by_code, as_of = sigungu_warning_status(db, warn_regions, warn_region_up_by_id())
    return _with_properties(status_by_code, as_of.isoformat() if as_of else None)


@router.get("/sigungu-rain", dependencies=[Depends(require_service_token)])
def sigungu_rain(db: Session = Depends(get_db)) -> dict:
    """시군구 250개 폴리곤 각각에 가장 최근 관측된 일 강수량·색상을 얹어 GeoJSON으로 돌려준다."""
    today = date.today()
    rain_by_code = sigungu_rain_levels(db, list(_sigungu_stations()))
    return _with_properties(rain_by_code, today.isoformat())


@router.get("/sigungu-wind", dependencies=[Depends(require_service_token)])
def sigungu_wind(db: Session = Depends(get_db)) -> dict:
    """시군구 250개 폴리곤 각각에 가장 최근 관측된 최대풍속·색상을 얹어 GeoJSON으로 돌려준다."""
    today = date.today()
    wind_by_code = sigungu_wind_levels(db, list(_sigungu_stations()))
    return _with_properties(wind_by_code, today.isoformat())
