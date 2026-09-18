"""지난 해들의 평년 대비 GDD 편차를 관측소별로 계산해 CSV 로 남긴다. **DB 에는 넣지 않는다.**

왜 필요한가:
    2026년 편차가 전국 평균 +11.5% 다(1/1~9/18). 이게 "올해가 이상한 해" 인지 "평년값이 낮게
    잡혀 매년 이런지" 는 지난 해와 견줘야 안다. 지도 색 경계(app/domain/gdd.py 의 _TIERS)를
    정하려면 그 비교가 있어야 한다.

왜 DB 에 안 넣나:
    필요한 건 관측소당 연도별 편차 **하나**다. 일별 자료는 그걸 내는 중간 재료라 받은 자리에서
    더하고 버린다. weather_daily 에 넣으면 120개소 × 365일 × 2년 = 87,600행이 쌓이는데,
    지도·밭은 올해 1/1 부터만 보므로(gdd_region.py) 아무도 안 읽는 행이다.
    이 스크립트의 결과는 240행짜리 CSV 한 장이다.

같은 기간을 견준다:
    올해가 9/18 까지 쌓였으면 지난 해도 1/1~9/18 만 더한다. 12/31 까지 다 더하면 분모가
    달라져 편차를 비교할 수 없다. END_MMDD 는 오늘 날짜에서 온다.

월별도 같이 낸다 (year_deviation_monthly.csv):
    지도의 "누적" 편차는 한 해 안에서도 움직인다 — 1월 말은 분모가 작아 ±30% 도 흔하고
    9월엔 +11%, 12월엔 더 줄 수 있다. 경계를 ±10% 로 박으면 같은 지도가 계절마다 다른 뜻이
    된다. 월별을 보면 고정 % 경계가 애초에 되는 물건인지 드러난다.
      month_dev  그 달만의 편차 — 어느 달이 더웠나
      cum_dev    그 달 말 기준 누적 편차 — 그날 지도가 뭘 보여줬을까
    같은 API 응답에서 나오므로 호출이 늘지 않는다.

실행: py -m pipeline.region.year_deviation --years 2024 2025
      ⚠ API 를 관측소 수 × 연도 수만큼 부른다(120 × 2 = 240회). 창 하나에서만.
"""

import argparse
import calendar
import csv
from datetime import date

from app.core.config import DATA_DIR, KMA_API_KEY
from app.core.db import new_session
from app.domain.gdd import daily_gdd
from app.service.gdd_region import _normal_gdd_by_station
from pipeline.kma_client import fetch_weather_daily, normalize_weather_daily
from pipeline.region.asos import usable

STATIONS_PATH = DATA_DIR / "stations.csv"
OUT_PATH = DATA_DIR / "ref" / "year_deviation.csv"
MONTHLY_PATH = DATA_DIR / "ref" / "year_deviation_monthly.csv"


def _daily(api_key: str, stn: str, year: int, end_mmdd: str) -> list[tuple[date, float]]:
    """한 관측소·한 해의 1/1~end 일별 GDD. 결측일은 뺀다. 응답이 비면 빈 리스트."""
    raw = fetch_weather_daily(api_key, stn, f"{year}0101", f"{year}{end_mmdd}")
    return [
        (r["date"], daily_gdd(r["tmax"], r["tmin"]))
        for r in normalize_weather_daily(raw)
        if r["tmax"] is not None and r["tmin"] is not None
    ]


def _month_ends(year: int, today: date) -> list[date]:
    """그 해 1월부터 오늘 달까지의 월말. 오늘 달은 오늘 날짜로 자른다(같은 기간 비교)."""
    ends = [date(year, m, calendar.monthrange(year, m)[1]) for m in range(1, today.month)]
    ends.append(date(year, today.month, today.day))
    return ends


def main() -> None:
    parser = argparse.ArgumentParser(description="지난 해 평년 대비 GDD 편차")
    parser.add_argument("--years", type=int, nargs="+", required=True, help="예: --years 2024 2025")
    args = parser.parse_args()

    if not KMA_API_KEY:
        raise SystemExit("KMA_API_KEY 가 없습니다 — ai-service/.env.local 확인")

    today = date.today()
    end_mmdd = today.strftime("%m%d")
    for y in args.years:
        if y >= today.year:
            raise SystemExit(f"{y}년은 지난 해가 아닙니다. 올해는 gdd_region 이 계산합니다")

    with STATIONS_PATH.open(encoding="utf-8-sig") as f:
        stations = usable(list(csv.DictReader(f)))
    stations.sort(key=lambda s: int(s["stn"]))
    이름 = {s["stn"]: s["name"] for s in stations}

    # 평년은 연도와 무관하다(월·일 고정행). 월말마다 "1/1~그 달 말" 누적과 "그 달만" 을 구한다.
    # 날짜는 올해 것을 쓴다 — normals 에 2/29 가 없어 윤년 해의 2월은 하루가 빠지는데,
    # 한 달 30일치 중 하루라 편차에 0.1%p 도 안 미친다.
    # ⚠ 1·2월은 평년 GDD 가 0 이다(기준온도 5℃ 아래라 daily_gdd 가 0 으로 자른다). 그 달은
    #   편차를 낼 수 없어 빈칸으로 둔다. 3월도 분모가 50 남짓이라 편차가 크게 튄다 —
    #   고정 % 경계가 이른 봄에 쓸모없는 이유가 여기 있다
    stns = [s["stn"] for s in stations]
    ends_norm = _month_ends(today.year, today)
    db = new_session()
    try:
        cum_norm = [_normal_gdd_by_station(db, stns, date(today.year, 1, 1), e) for e in ends_norm]
        mon_norm = [
            _normal_gdd_by_station(db, stns, date(today.year, e.month, 1), e) for e in ends_norm
        ]
    finally:
        db.close()
    평년 = cum_norm[-1]   # 1/1 ~ 오늘. 연간 표는 이걸 쓴다

    out, monthly = [], []
    for y in args.years:
        print(f"\n=== {y}년 1/1 ~ {end_mmdd[:2]}/{end_mmdd[2:]} ===")
        ends = _month_ends(y, today)
        for i, s in enumerate(stations, 1):
            stn = s["stn"]
            if stn not in 평년:
                continue
            daily = _daily(KMA_API_KEY, stn, y, end_mmdd)
            if not daily:
                print(f"[{i}/{len(stations)}] station={stn} {이름[stn]}: 자료 없음")
                continue

            for k, end in enumerate(ends):
                cum_a = sum(g for d, g in daily if d <= end)
                mon_a = sum(g for d, g in daily if d.month == end.month)
                cum_n = cum_norm[k].get(stn)
                mon_n = mon_norm[k].get(stn)
                monthly.append({
                    "year": y, "stn": stn, "name": 이름[stn], "month": end.month,
                    "month_dev": f"{(mon_a - mon_n) / mon_n * 100:.1f}" if mon_n else "",
                    "cum_dev": f"{(cum_a - cum_n) / cum_n * 100:.1f}" if cum_n else "",
                })

            actual = sum(g for _, g in daily)
            dev = (actual - 평년[stn]) / 평년[stn] * 100
            out.append({"year": y, "stn": stn, "name": 이름[stn], "days": len(daily),
                        "actual_gdd": f"{actual:.1f}", "normal_gdd": f"{평년[stn]:.1f}",
                        "deviation_pct": f"{dev:.1f}"})
            print(f"[{i}/{len(stations)}] station={stn} {이름[stn]}: {len(daily)}일 · {dev:+.1f}%")

    if not out:
        raise SystemExit("받은 자료가 없습니다")
    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    with MONTHLY_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(monthly[0].keys()))
        w.writeheader()
        w.writerows(monthly)

    print(f"\n연간 {len(out)}행 → {OUT_PATH}")
    print(f"월별 {len(monthly)}행 → {MONTHLY_PATH}")
    for y in args.years:
        devs = sorted(float(r["deviation_pct"]) for r in out if r["year"] == y)
        if devs:
            print(f"  {y}년  관측소 {len(devs)}개 · 편차 {devs[0]:+.1f} ~ {devs[-1]:+.1f}% "
                  f"· 중앙 {devs[len(devs) // 2]:+.1f}% · 평균 {sum(devs) / len(devs):+.1f}%")

    print("\n월말 기준 누적 편차 중앙값 — 그날 지도가 보여줬을 값")
    print("      " + "".join(f"{e.month:>2}월 " for e in ends_norm))
    for y in args.years:
        줄 = []
        for e in ends_norm:
            v = sorted(float(r["cum_dev"]) for r in monthly
                       if r["year"] == y and r["month"] == e.month and r["cum_dev"])
            줄.append(f"{v[len(v) // 2]:+5.1f}" if v else "    -")
        print(f"  {y}  " + " ".join(줄))


if __name__ == "__main__":
    main()
