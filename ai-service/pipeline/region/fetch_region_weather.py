"""ASOS 관측소 전체의 올해 1/1~오늘 일통계를 적재한다.

weather_daily 는 plot_id 로 키가 잡혀 있어 텃밭 전용이다. 관측소 자체 데이터를
담을 테이블을 새로 만드는 대신, "stn:<관측소번호>" 를 합성 plot_id 로 써서 같은
테이블·적재 함수(load_weather_daily)를 그대로 재사용한다
(app/domain/gdd.py 의 station_plot_id 가 같은 규칙으로 읽는다).

lat/lon 은 천리안 LST 조회에만 쓰이는데 관측소 단위로는 그 값이 필요 없어
with_lst=False 로 건너뛰므로 더미(0, 0)를 넘긴다.

⚠ 후보를 sigungu_station.csv 에서 읽지 않는다. 그건 "지도가 배정한 곳" 이지
"관측이 있는 곳" 이 아니다. 그걸 읽었더니 ASOS 121개 중 26개의 실측이 통째로 비었다 —
184 제주·185 고산·188 성산·102 백령도처럼 실제로 관측하는 곳이 섞여 있었고,
제주시는 실측을 182 제주공항에서 받도록 배정돼 있어 184 제주가 목록에 없었다.
그 결과 밭 상세(stations 테이블)가 제주 관측소를 쓰지 못했다.
fetch_all_normals 가 겪은 것과 같은 함정이다 — **받는 쪽은 배정을 보지 않는다.**

빈손으로 오는 관측소가 있다(레이더·도서·신설 등). 0일치는 정상이고, 그 관측소는
map·stations 후보에서 자연히 빠진다.

실행: py -m pipeline.region.fetch_region_weather      ⚠ API 를 관측소 수만큼 부른다
      두 창에서 동시에 돌리지 말 것 — 같은 키의 동시 접속이 막혀 ConnectTimeout 이 난다
"""

import csv
from datetime import date

from app.core.config import DATA_DIR, KMA_API_KEY
from app.core.db import new_session
from app.domain.gdd import station_plot_id
from pipeline.load_data import load_weather_daily
from pipeline.region.asos import asos_only

STATIONS_PATH = DATA_DIR / "stations.csv"


def main() -> None:
    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    with STATIONS_PATH.open(encoding="utf-8-sig") as f:
        asos = asos_only(list(csv.DictReader(f)))
    asos.sort(key=lambda s: int(s["stn"]))

    today = date.today()
    tm1, tm2 = f"{today.year}0101", today.strftime("%Y%m%d")

    빈곳 = []
    db = new_session()
    try:
        # ⚠ [i/n] 은 순번이지 관측소 번호가 아니다. station= 뒤를 본다
        for i, s in enumerate(asos, 1):
            n = load_weather_daily(
                db, station_plot_id(s["stn"]), KMA_API_KEY, s["stn"], 0, 0, tm1, tm2,
                with_lst=False,
            )
            print(f"[{i}/{len(asos)}] station={s['stn']} {s.get('name', '')}: {n}일치")
            if not n:
                빈곳.append(s)
    finally:
        db.close()

    print(f"\n실측 있음 {len(asos) - len(빈곳)}/{len(asos)}개")
    if 빈곳:
        목록 = ", ".join(s["stn"] + " " + s.get("name", "") for s in 빈곳)
        print(f"0일치 {len(빈곳)}개: {목록}")


if __name__ == "__main__":
    main()
