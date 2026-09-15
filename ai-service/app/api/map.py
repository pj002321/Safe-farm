"""시군구 경계 + 누적 GDD 평년 대비 편차를 얹은 GeoJSON (V1-37 색칠 지도).

정적 파일(sigungu.geojson, sigungu_station.csv)은 요청마다 안 읽고 lru_cache 로
한 번만 읽는다 — 배포 중 파일이 바뀔 일이 없는 참조 데이터라서다.
"""

from __future__ import annotations

import csv
import json
from functools import lru_cache

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import DATA_DIR
from app.core.db import get_db
from app.core.security import require_service_token
from app.service.gdd_region import sigungu_gdd_deviation

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


@router.get("/sigungu-gdd", dependencies=[Depends(require_service_token)])
def sigungu_gdd(db: Session = Depends(get_db)) -> dict:
    """시군구 250개 폴리곤 각각에 올해 누적 GDD·평년 대비 편차·색상을 얹어 GeoJSON으로 돌려준다."""
    deviation_by_code = sigungu_gdd_deviation(db, list(_sigungu_stations()))

    features = [
        {**feature, "properties": {**feature["properties"], **deviation_by_code.get(feature["properties"]["code"], {})}}
        for feature in _sigungu_geojson()["features"]
    ]
    return {"type": "FeatureCollection", "features": features}
