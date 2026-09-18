"""밭 상세가 쓰는 stations · weather_obs_daily 를 지도 쪽 실측(weather_daily)에서 채운다.

왜 필요한가:
    화면 경로가 둘인데 보는 표가 다르다.

        지도    sigungu_station.csv → weather_daily        (pipeline/region/fetch_region_weather)
        밭 상세  stations 테이블     → weather_obs_daily    (여기서 채운다)

    밭 상세 쪽은 stations 가 광역시 9곳뿐이고 weather_obs_daily 는 더미 17행(관측소 3개,
    2026-09-06~09-12)이 전부였다. 그래서 경북 상주의 밭이 130km 밖 대전을 보고, 최근 3·5·7일
    누적 강수량이 전부 '관측 없음' 으로 떴다(밭 29개 전수 확인).

    ⚠ 그 더미 17행은 **지어낸 값이다.** 같은 날 같은 관측소인데 기상청 실측과 다르다
    (2026-09-08 서울 강수 더미 6.5mm vs 실측 0.0mm). 덮어써도 잃을 것이 없다.

왜 새로 안 받나:
    두 표가 같은 기상청 일통계(arcltr_sfc_day)의 다른 그릇이다. 컬럼이 1:1 로 대응한다.

        weather_daily.plot_id 'stn:108'  →  weather_obs_daily.station_code '108'
        date / tmax / tmin / rain        →  obs_date / temp_max / temp_min / rainfall_mm

    이미 받아 둔 것을 옮기면 되므로 **API 호출이 0회다.** 그래서 fetch_region_weather 를
    돌린 뒤에 이걸 돌린다.

왜 ASOS 전체(121개)가 아니라 실측이 있는 곳만 넣나:
    stations 에 넣기만 하고 관측이 없으면 "가장 가까운 관측소 이름" 만 맞아지고 값은 빈다.
    오히려 더미가 있던 곳에서 멀어지는 밭이 생겨 빈 밭이 늘 수도 있다. 이름과 값이 같이 와야 한다.
    AWS(300번 이상)는 제외한다 — 평년값이 없어 밭 상세의 평년 비교를 못 한다.

실행: py -m pipeline.farm.sync_station_obs        (DB 안에서 옮기기만. API 없음)
"""

import csv

from sqlalchemy import text

from app.core.config import DATA_DIR
from app.core.db import new_session
from pipeline.region.asos import is_asos

MASTER_PATH = DATA_DIR / "master" / "stations.csv"

# weather_daily 에서 관측이 이만큼은 있어야 stations 에 넣는다. 며칠치뿐인 관측소를 넣으면
# 그 관측소에 붙은 밭이 '관측 없음' 으로 뜬다 — 더미 17행이 그랬다
MIN_ROWS = 30


def main() -> None:
    db = new_session()
    try:
        # ── ① 실측이 충분한 ASOS 를 고른다 ────────────────────────────────
        rows = db.execute(text(
            "select substring(plot_id from 5) as stn, count(*) as n "
            "from weather_daily where plot_id like 'stn:%' "
            "group by 1 having count(*) >= :n"
        ), {"n": MIN_ROWS}).all()
        쓸것 = sorted((r[0] for r in rows if is_asos(r[0])), key=int)

        with (DATA_DIR / "stations.csv").open(encoding="utf-8-sig") as f:
            좌표 = {r["stn"]: r for r in csv.DictReader(f)}
        쓸것 = [s for s in 쓸것 if s in 좌표]
        print(f"실측 {MIN_ROWS}행 이상인 ASOS {len(쓸것)}개")

        # ── ② master CSV 를 다시 쓴다 (시딩 입력이자 기록) ──────────────────
        with MASTER_PATH.open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["station_code", "name", "latitude", "longitude"])
            for s in 쓸것:
                w.writerow([s, 좌표[s]["name"], 좌표[s]["lat"], 좌표[s]["lon"]])
        print(f"  {MASTER_PATH} 에 {len(쓸것)}행")

        # ── ③ stations upsert ─────────────────────────────────────────────
        for s in 쓸것:
            db.execute(text(
                "insert into stations (station_code, name, latitude, longitude) "
                "values (:c, :n, :lat, :lon) "
                "on conflict (station_code) do update set "
                "name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude"
            ), {"c": s, "n": 좌표[s]["name"], "lat": 좌표[s]["lat"], "lon": 좌표[s]["lon"]})
        db.commit()
        n = db.execute(text("select count(*) from stations")).scalar()
        print(f"  stations {n}행")

        # ── ④ weather_obs_daily 를 weather_daily 에서 옮긴다 ───────────────
        # tmax/tmin 둘 다 있는 날만. 하나라도 없으면 밭 상세가 GDD 를 못 쌓는다.
        # rain 은 없어도 넣는다 — 강수량만 결측인 날이 3.2% 고, 기온은 살려야 한다
        moved = db.execute(text(
            "insert into weather_obs_daily "
            "(station_code, obs_date, temp_max, temp_min, rainfall_mm) "
            "select substring(w.plot_id from 5), w.date, w.tmax, w.tmin, w.rain "
            "from weather_daily w "
            "where w.plot_id like 'stn:%' and w.tmax is not null and w.tmin is not null "
            "  and substring(w.plot_id from 5) in (select station_code from stations) "
            "on conflict (station_code, obs_date) do update set "
            "  temp_max = excluded.temp_max, temp_min = excluded.temp_min, "
            "  rainfall_mm = excluded.rainfall_mm"
        )).rowcount
        db.commit()
        r = db.execute(text(
            "select count(distinct station_code), count(*), min(obs_date), max(obs_date) "
            "from weather_obs_daily"
        )).one()
        print(f"  weather_obs_daily {moved}행 반영 → 관측소 {r[0]}개 · {r[1]}행 · {r[2]} ~ {r[3]}")

        # ── ⑤ 관측이 하나도 없는 관측소는 stations 에서 뺀다 ────────────────
        # 남겨 두면 그 근처 밭이 "○○ 관측소 기준" 이라고 이름만 맞게 뜨고 값은 빈다.
        # 예전 9행에 있던 184 제주가 그랬다 — weather_daily 에 제주 실측이 없어 옮길 게 없다
        # (제주는 182 제주공항이 관측한다. 지도 쪽도 실측을 182 에서 받는다).
        # 밭이 그 관측소를 이미 가리키고 있으면 FK 때문에 지워지지 않는데, 그건 정상이다 —
        # 그 밭은 다음 조회에서 더 멀지만 값이 있는 관측소로 옮겨 간다
        빈곳 = [r[0] for r in db.execute(text(
            "select s.station_code from stations s "
            "left join weather_obs_daily o on o.station_code = s.station_code "
            "group by s.station_code having count(o.obs_date) = 0"
        ))]
        for s in 빈곳:
            db.execute(text("delete from stations where station_code = :c"), {"c": s})
        db.commit()
        n = db.execute(text("select count(*) from stations")).scalar()
        print(f"  관측 없는 관측소 {len(빈곳)}개 제거 → stations {n}행")
    finally:
        db.close()


if __name__ == "__main__":
    main()
