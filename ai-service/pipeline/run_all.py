"""날씨(KMA 일통계 + 천리안 LST)·특보 파이프라인 진입점.

텃밭(plots) 등록 플로우가 아직 없어 stn/lat/lon 을 직접 받는다 — DOMAIN_REF §2 "텃밭 등록 시
한 번에 해둘 것"이 구현되면 plot_id 로 조회해 대체한다.

사용 예 (상주 실측 좌표):
  python -m pipeline.run_all --plot-id plot_sangju --stn 137 \
      --lat 36.4084 --lon 128.1574 --tm1 20260401 --tm2 20260913
"""
import argparse

from app.core.config import KMA_API_KEY
from app.core.db import new_session
from pipeline.load_data import load_alerts, load_disaster_rule, load_normals, load_weather_daily


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plot-id", required=True)
    parser.add_argument("--stn", required=True, help="기상청 관측소 번호 (data/stations.csv)")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--tm1", required=True, help="시작일 yyyymmdd")
    parser.add_argument("--tm2", required=True, help="종료일 yyyymmdd")
    parser.add_argument("--skip-lst", action="store_true", help="천리안 LST 호출 생략(2차라 느림)")
    parser.add_argument(
        "--skip-normals", action="store_true", help="평년값(연중 365일치) 적재 생략"
    )
    parser.add_argument(
        "--solar-term", help="절기재해 기준값을 적재할 절기 코드(01~24). 생략하면 건너뜀"
    )
    parser.add_argument(
        "--risk", default="01", help="절기재해 종류(기본 01=저온, DOMAIN_REF §3)"
    )
    parser.add_argument("--disaster-yy1", default="2015", help="절기재해 평균 집계 시작 연도")
    parser.add_argument("--disaster-yy2", default="2024", help="절기재해 평균 집계 종료 연도")
    args = parser.parse_args()

    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    db = new_session()
    try:
        n = load_weather_daily(
            db, args.plot_id, KMA_API_KEY, args.stn, args.lat, args.lon,
            args.tm1, args.tm2, with_lst=not args.skip_lst,
        )
        print(f"weather_daily: {n}건 적재")

        n = load_alerts(db, KMA_API_KEY)
        print(f"official_alerts: {n}건 적재")

        if not args.skip_normals:
            n = load_normals(db, KMA_API_KEY, args.stn)
            print(f"normals: {n}건 적재")

        if args.solar_term:
            load_disaster_rule(
                db,
                KMA_API_KEY,
                args.stn,
                args.risk,
                args.solar_term,
                args.disaster_yy1,
                args.disaster_yy2,
            )
            print(f"disaster_rules: risk={args.risk} solar_term={args.solar_term} 적재")
    finally:
        db.close()


if __name__ == "__main__":
    main()
