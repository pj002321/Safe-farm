"""날씨(KMA 일통계 + 천리안 LST)·특보 파이프라인 진입점.

텃밭(plots) 등록 플로우가 아직 없어 stn/lat/lon 을 직접 받는다 — DOMAIN_REF §2 "텃밭 등록 시
한 번에 해둘 것"이 구현되면 plot_id 로 조회해 대체한다.

사용 예 (상주 실측 좌표):
  python -m pipeline.run_all --plot-id plot_sangju --stn 137 \
      --lat 36.4084 --lon 128.1574 --tm1 20260401 --tm2 20260913
"""
import argparse

from app.core.config import KMA_API_KEY
from app.core.db import SessionLocal
from pipeline.load_data import load_alerts, load_weather_daily


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plot-id", required=True)
    parser.add_argument("--stn", required=True, help="기상청 관측소 번호 (data/stations.csv)")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--tm1", required=True, help="시작일 yyyymmdd")
    parser.add_argument("--tm2", required=True, help="종료일 yyyymmdd")
    parser.add_argument("--skip-lst", action="store_true", help="천리안 LST 호출 생략(2차라 느림)")
    args = parser.parse_args()

    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    db = SessionLocal()
    try:
        n = load_weather_daily(
            db, args.plot_id, KMA_API_KEY, args.stn, args.lat, args.lon,
            args.tm1, args.tm2, with_lst=not args.skip_lst,
        )
        print(f"weather_daily: {n}건 적재")

        n = load_alerts(db, KMA_API_KEY)
        print(f"official_alerts: {n}건 적재")
    finally:
        db.close()


if __name__ == "__main__":
    main()
