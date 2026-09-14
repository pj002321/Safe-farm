"""DB 없이 KMA fetch+정규화 결과를 눈으로 확인하는 미리보기. run_all.py 와 달리 저장은 안 한다.

VS Code 작업(.vscode/tasks.json)의 "ai-service: preview kma data" 로 실행하거나
`python -m pipeline.preview` 로 직접 실행.
"""
from datetime import date, timedelta

from app.core.config import KMA_API_KEY
from pipeline.kma_client import (
    fetch_daily_lst_min,
    fetch_warnings,
    fetch_weather_daily,
    normalize_alerts,
    normalize_weather_daily,
)

STN = 137  # 상주 — DOMAIN_REF 실측 기준점
LAT, LON = 36.4084, 128.1574


def _fmt(v):
    return f"{v:.1f}" if v is not None else "-"


def main():
    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    today = date.today()
    start = today - timedelta(days=6)

    print(f"=== weather_daily : 상주(stn={STN}) {start}~{today} 일통계 ===")
    rows = normalize_weather_daily(
        fetch_weather_daily(KMA_API_KEY, STN, start.strftime("%Y%m%d"), today.strftime("%Y%m%d"))
    )
    print(f"{'date':<12}{'tmax':>6}{'tmin':>6}{'tmean':>7}{'rain':>6}{'wind_max':>9}")
    for r in rows:
        print(
            f"{str(r['date']):<12}{_fmt(r['tmax']):>6}{_fmt(r['tmin']):>6}"
            f"{_fmt(r['tmean']):>7}{_fmt(r['rain']):>6}{_fmt(r['wind_max']):>9}"
        )

    print()
    print("=== weather_daily.lst_min : 천리안 LST 일 최저(서리 판정용, 최근 2일) ===")
    for d in [today - timedelta(days=1), today]:
        print(f"{d}  lst_min={fetch_daily_lst_min(KMA_API_KEY, LAT, LON, d)}")

    print()
    print("=== official_alerts : 현재 전국 발효 특보 ===")
    alerts = normalize_alerts(fetch_warnings(KMA_API_KEY))
    print(f"{len(alerts)}건")
    for a in alerts[:5]:
        print(a)


if __name__ == "__main__":
    main()
