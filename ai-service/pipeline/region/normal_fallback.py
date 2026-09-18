"""평년값이 없는 관측소가 평년값을 어디서 빌릴지 정한다 → data/ref/normal_fallback.csv

왜 필요한가:
    ASOS 121개 중 37개는 평년값이 없다(공항·레이더·도서·신설). 그중 12개는 **관측은 한다** —
    인천공항·제주공항·순천·광양시 등. 평년값이 없다고 후보에서 빼면 그 지역의 비·바람·오늘
    기온까지 수십 km 밖 관측소 것을 쓰게 된다(순천시 → 고흥 42.7km). 실측은 자기 관측소에서 받고,
    **평년값만** 다른 곳에서 빌리면 된다. 그 "다른 곳"을 여기서 정한다.

왜 거리로 안 고르나:
    한국에서 "N km 안은 기후가 비슷하다" 는 N 이 없다. 강릉–대관령은 17km 인데 평년 GDD 가 35%
    다르고, 인천–이천은 80km 인데 0.2% 다. 거리로 고르면 12곳 중 3곳이 5% 를 넘겼다
    (김해공 -5.5% · 순천 -7.5% · 덕적북리 -13.8%). 지형이 원인인데 고도 자료도 없다.

그래서 **올해 실측으로 닮음을 잰다.** 같은 날짜의 일별 GDD 가 가장 붙어 있는 곳이 짝이다.
지형이 만든 결과를 직접 재는 것이라 고도를 몰라도 대관령 같은 짝은 걸러진다.
2026-09-18 실측: 12곳 전부 오차 4.3% 이내, 5% 초과 0 (거리 기준은 3).

규칙 셋 (순서대로):
    ① 가장 가까운 평년 보유 관측소가 CLOSE_KM 이내 → 그냥 쓴다. 제주공→제주 2.8km 같은 경우.
       제주 관측소 넷은 실측이 없어 닮음을 못 재는데, 이 규칙이 없으면 제주공항이 231km 밖
       통영(우연히 GDD 합이 같았다)으로 간다.
    ② 아니면 SEARCH_KM 이내에서 실측이 가장 닮은 곳. 단 누적 GDD 오차가 MAX_DIFF_PCT 이내일 때만.
       SEARCH_KM 은 "이 안은 비슷하다" 가 아니라 "이 밖은 안 본다" 는 울타리다.
       50 이면 덕적북리의 짝 강화(57.8km, -4.3%)가 잘려 인천(-13.8%)으로 간다 — 섬은 멀리서 찾는다.
    ③ 닮음을 잴 후보가 없으면 SEARCH_KM 안의 가장 가까운 곳. 검증이 안 된 짝이라 rule 에 표시된다.
    셋 다 아니면 짝이 없다 — 그 관측소는 후보에서 빠지고 시군구는 지금처럼 더 먼 관측소를 본다.

순환이 없는 이유:
    입력은 stations.csv(고정) · normal_stations.csv(fetch 가 만든 것) · weather_daily(실측)다.
    map_stations_to_sigungu 의 출력은 안 읽는다. map 은 이 파일을 읽기만 한다.

한 해 실측이라 우연히 닮았을 수 있다. MAX_DIFF_PCT 가 1차 방어고, 두 번째 해가 쌓이면
다시 돌려 짝이 바뀌는지 본다 — 바뀌면 그 짝은 불안정한 것이다.

실행: py -m pipeline.region.normal_fallback        (DB 읽기만. API 호출 없음)
"""

import csv

from sqlalchemy import text

from app.core.config import DATA_DIR
from app.core.db import new_session
from app.domain.gdd import daily_gdd
from pipeline.region.asos import asos_only, excluded_stations, normal_stations
from pipeline.region.map_stations_to_sigungu import haversine_km

STATIONS_PATH = DATA_DIR / "stations.csv"
OUT_PATH = DATA_DIR / "ref" / "normal_fallback.csv"

CLOSE_KM = 5.0        # 이 안이면 닮음을 따질 것 없이 가장 가까운 곳
SEARCH_KM = 70.0      # 이 밖은 안 본다
MAX_DIFF_PCT = 5.0    # 누적 GDD 오차 상한. 색 구간이 10%p 라 그 절반
MIN_DAYS = 100        # 겹치는 실측이 이보다 적으면 닮음을 못 잰다


def _daily_gdd_by_station(db) -> dict[str, dict]:
    """weather_daily 의 관측소 실측을 {stn: {date: gdd}} 로. plot_id 'stn:NNN' 만."""
    out: dict[str, dict] = {}
    rows = db.execute(text(
        "select plot_id, date, tmax, tmin from weather_daily "
        "where plot_id like 'stn:%' and tmax is not null and tmin is not null"
    ))
    for plot_id, d, tmax, tmin in rows:
        out.setdefault(plot_id[4:], {})[d] = daily_gdd(tmax, tmin)
    return out


def _pick(stn: str, st: dict, 보유: list[str], 일별: dict) -> dict | None:
    """관측소 하나의 짝. 없으면 None."""
    def km(a, b):
        return haversine_km(float(st[a]["lon"]), float(st[a]["lat"]),
                            float(st[b]["lon"]), float(st[b]["lat"]))

    후보 = sorted((km(stn, d), d) for d in 보유)
    if not 후보:
        return None
    d0, nearest = 후보[0]
    if d0 <= CLOSE_KM:
        return {"normal_stn": nearest, "km": d0, "rule": "close", "gdd_diff_pct": "", "days": ""}

    mine = 일별.get(stn, {})
    잴수있는 = []
    for dist, d in 후보:
        if dist > SEARCH_KM:
            break
        공통 = sorted(set(mine) & set(일별.get(d, {})))
        if len(공통) >= MIN_DAYS:
            mae = sum(abs(mine[x] - 일별[d][x]) for x in 공통) / len(공통)
            a = sum(mine[x] for x in 공통)
            b = sum(일별[d][x] for x in 공통)
            잴수있는.append((mae, dist, d, (a - b) / b * 100, len(공통)))
    if 잴수있는:
        mae, dist, d, diff, days = min(잴수있는)
        if abs(diff) <= MAX_DIFF_PCT:
            return {"normal_stn": d, "km": dist, "rule": "similar",
                    "gdd_diff_pct": f"{diff:.1f}", "days": days}
        return None   # 가장 닮은 것도 상한을 넘는다 — 빌리지 않는다
    if d0 <= SEARCH_KM:
        return {"normal_stn": nearest, "km": d0, "rule": "nearest", "gdd_diff_pct": "", "days": ""}
    return None


def main() -> None:
    with STATIONS_PATH.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    st = {r["stn"]: r for r in rows}
    asos = [s["stn"] for s in asos_only(rows)]
    보유 = sorted((s for s in normal_stations() if s in st), key=int)

    db = new_session()
    try:
        일별 = _daily_gdd_by_station(db)
    finally:
        db.close()

    # 평지 밭의 기준이 못 되는 관측소는 짝을 만들지 않는다 — 만들면 usable 에서 다시 걸러
    # 지지만, 목록에 남으면 "왜 여기가 있지" 를 두 번 묻게 된다(asos.py 의 usable docstring)
    뺄것 = excluded_stations()
    필요 = sorted((s for s in asos if s in 일별 and s not in set(보유) and s not in 뺄것), key=int)
    보유 = [s for s in 보유 if s not in 뺄것]
    out = []
    거부 = []
    for s in 필요:
        r = _pick(s, st, 보유, 일별)
        if r is None:
            거부.append(s)
            continue
        out.append({"stn": s, "name": st[s]["name"], "normal_stn": r["normal_stn"],
                    "normal_name": st[r["normal_stn"]]["name"], "km": f"{r['km']:.1f}",
                    "rule": r["rule"], "gdd_diff_pct": r["gdd_diff_pct"], "days": r["days"]})

    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()) if out else
                           ["stn", "name", "normal_stn", "normal_name", "km", "rule",
                            "gdd_diff_pct", "days"])
        w.writeheader()
        w.writerows(out)

    print(f"실측은 있고 평년값은 없는 ASOS {len(필요)}개 → 짝 {len(out)}개 → {OUT_PATH}")
    for r in out:
        표 = f"{r['gdd_diff_pct']:>6}%" if r["gdd_diff_pct"] else "      -"
        print(f"  {r['stn']:>4} {r['name']:10} -> {r['normal_stn']:>4} {r['normal_name']:8} "
              f"{r['km']:>6}km  {표}  {r['rule']}")
    if 거부:
        목록 = ", ".join(s + " " + st[s]["name"] for s in 거부)
        print(f"짝 없음 {len(거부)}개: {목록}")


if __name__ == "__main__":
    main()
