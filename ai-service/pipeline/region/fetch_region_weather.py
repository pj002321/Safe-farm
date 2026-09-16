"""sigungu_station.csv 의 관측소 전체(중복 제거)에 대해 올해 1/1~오늘 일통계를 적재한다.

weather_daily 는 plot_id 로 키가 잡혀 있어 텃밭 전용이다. 관측소 자체 데이터를
담을 테이블을 새로 만드는 대신, "stn:<관측소번호>" 를 합성 plot_id 로 써서 같은
테이블·적재 함수(load_weather_daily)를 그대로 재사용한다
(app/domain/gdd.py 의 station_plot_id 가 같은 규칙으로 읽는다).

lat/lon 은 천리안 LST 조회에만 쓰이는데 관측소 단위로는 그 값이 필요 없어
with_lst=False 로 건너뛰므로 더미(0, 0)를 넘긴다.

실행: py -3.12 -m pipeline.region.fetch_region_weather
"""

import csv
from datetime import date

from app.core.config import DATA_DIR, KMA_API_KEY
from app.core.db import new_session
from app.domain.gdd import station_plot_id
from pipeline.load_data import load_weather_daily

STATION_MAP_PATH = DATA_DIR / "ref" / "sigungu_station.csv"


def main() -> None:
    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    with STATION_MAP_PATH.open(encoding="utf-8") as f:
        stations = sorted({row["station"] for row in csv.DictReader(f)})

    today = date.today()
    tm1, tm2 = f"{today.year}0101", today.strftime("%Y%m%d")

    db = new_session()
    try:
        for i, stn in enumerate(stations, 1):
            n = load_weather_daily(
                db, station_plot_id(stn), KMA_API_KEY, stn, 0, 0, tm1, tm2, with_lst=False
            )
            print(f"[{i}/{len(stations)}] station={stn}: {n}일치")
    finally:
        db.close()


if __name__ == "__main__":
    main()
