"""ASOS 관측소 전체(121개)의 평년값을 적재한다.

run_all.py 는 --stn 하나씩만 받는다. 시군구 지도가 관측소 전체를 필요로 해서
이 스크립트가 그걸 돈다.

⚠ 후보를 sigungu_station.csv 에서 읽지 않는다. 그 파일을 만드는 쪽이 평년값 유무를
보고 후보를 정하면 순환이 된다(pipeline/region/asos.py docstring 참고).

기준연도를 --tmst 로 고른다. 기본 2021(1991~2020, source='kma') 이고, 2011 을 주면
1981~2010 을 source='kma-1981' 로 따로 담는다. 둘은 공존하고, 읽는 쪽이 새 기준을
우선한다(app/service/gdd_region.py). 옛 기준을 받는 이유는 관측소 이전으로 새 기준이
끊긴 곳(143 대구·146 전주) 때문이다 — 인근 관측소로 대신하면 지리 차이가 1.6~2.2℃ 로
기준 차이(0.3℃)보다 훨씬 커서 자기 도시의 옛 기준 값이 더 정확하다(2026-09-18 실측).

실행: py -m pipeline.region.fetch_all_normals [--tmst 2011]
"""

import argparse
import csv

from sqlalchemy import text

from app.core.config import DATA_DIR, KMA_API_KEY
from app.core.db import new_session
from pipeline.kma_client import NORMAL_SOURCE_BY_TMST
from pipeline.load_data import load_normals
from pipeline.region.asos import asos_only, is_asos, save_normal_stations

STATIONS_PATH = DATA_DIR / "stations.csv"
FULL_YEAR = 365  # 윤년이 섞여 366 이 오기도 한다. 이 미만이면 반쪽짜리로 본다


def _stations_with_normals(db, 이름: dict[str, str]) -> list[dict]:
    """DB 에 한 해치가 다 찬 ASOS 관측소. 기준(source)은 안 가린다 — 새 기준이든 옛
    기준이든 값이 있으면 후보가 된다. 어느 쪽을 쓸지는 읽는 쪽이 정한다.

    ⚠ group by 에 source 를 넣는다. 빼면 '새 기준 10일치 + 옛 기준 366일치' 같은 관측소가
    합계 376 으로 통과하는데, 읽는 쪽은 기준을 섞지 않으려고 새 기준 10일치만 써서
    누적 GDD 가 조용히 모자라게 된다.
    """
    rows = db.execute(
        text(
            "select distinct station from ("
            "  select station from normals where source like 'kma%' "
            "  group by station, source having count(*) >= :n"
            ") t"
        ),
        {"n": FULL_YEAR},
    )
    코드 = sorted({r[0] for r in rows if is_asos(r[0])}, key=int)
    return [{"stn": s, "name": 이름.get(s, "")} for s in 코드]


def main() -> None:
    parser = argparse.ArgumentParser(description="ASOS 전체 평년값 적재")
    parser.add_argument(
        "--tmst",
        type=int,
        default=2021,
        choices=sorted(NORMAL_SOURCE_BY_TMST),
        help="평년값 기준연도. 2021=1991~2020(kma), 2011=1981~2010(kma-1981)",
    )
    args = parser.parse_args()

    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    with STATIONS_PATH.open(encoding="utf-8-sig") as f:
        asos = asos_only(list(csv.DictReader(f)))
    asos.sort(key=lambda s: int(s["stn"]))
    이름 = {s["stn"]: s.get("name", "") for s in asos}
    source = NORMAL_SOURCE_BY_TMST[args.tmst]
    print(f"기준연도 {args.tmst} (source={source}) · 관측소 {len(asos)}개\n")

    # ⚠ 진행 표시의 [i/n] 은 순번이지 관측소 번호가 아니다. 둘을 헷갈려 "43번 관측소가
    #   366건 받았다" 고 읽은 적이 있다 — station= 뒤를 본다
    받은것 = []
    db = new_session()
    try:
        for i, s in enumerate(asos, 1):
            n = load_normals(db, KMA_API_KEY, s["stn"], tmst=args.tmst)
            print(f"[{i}/{len(asos)}] station={s['stn']} {s.get('name', '')}: {n}건")
            if n:
                받은것.append(s)

        # 후보 목록은 이번에 받은 것만이 아니라 **DB 에 쌓인 전부**로 만든다. 옛 기준과
        # 새 기준을 따로 돌리므로, 이번 회차만 보면 앞서 받아 둔 쪽이 목록에서 빠진다.
        # map_stations_to_sigungu 가 이 목록을 후보로 읽는다 — ASOS 번호만으로 고르면
        # 평년값 없는 공항·레이더·신설 관측소가 섞여 250개 중 76개가 회색이 됐다(실측).
        보유 = _stations_with_normals(db, 이름)
    finally:
        db.close()

    save_normal_stations(보유)
    빈곳 = [s["stn"] for s in asos if s["stn"] not in {b["stn"] for b in 보유}]
    print(f"\n이번 회차 {len(받은것)}/{len(asos)}개 수신")
    print(f"평년값 보유(기준 무관) {len(보유)}개 → data/ref/normal_stations.csv")
    if 빈곳:
        목록 = ", ".join(f"{s} {이름.get(s, '')}" for s in 빈곳)
        print(f"어느 기준에도 없음 {len(빈곳)}개: {목록}")


if __name__ == "__main__":
    main()
