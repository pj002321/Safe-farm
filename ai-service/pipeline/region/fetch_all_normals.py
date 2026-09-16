"""sigungu_station.csv 의 관측소 전체(중복 제거)에 대해 평년값을 적재한다.

run_all.py 는 --stn 하나씩만 받는다. 시군구 지도는 관측소 250개 전체가
필요해서 이 스크립트가 그걸 돈다.

실행: py -3.12 -m pipeline.region.fetch_all_normals
"""

import csv

from app.core.config import DATA_DIR, KMA_API_KEY
from app.core.db import new_session
from pipeline.load_data import load_normals

STATION_MAP_PATH = DATA_DIR / "ref" / "sigungu_station.csv"


def main() -> None:
    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    with STATION_MAP_PATH.open(encoding="utf-8") as f:
        stations = sorted({row["station"] for row in csv.DictReader(f)})

    db = new_session()
    try:
        for i, stn in enumerate(stations, 1):
            n = load_normals(db, KMA_API_KEY, stn)
            print(f"[{i}/{len(stations)}] station={stn}: {n}건")
    finally:
        db.close()


if __name__ == "__main__":
    main()
