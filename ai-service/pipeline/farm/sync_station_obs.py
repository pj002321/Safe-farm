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

누구를 넣나 — 조건이 **둘**이다:
    ① 실측이 MIN_ROWS 행 이상 있을 것. 넣기만 하고 관측이 없으면 "가장 가까운 관측소 이름" 만
       맞아지고 값은 빈다. 더미 17행이 그랬다.
    ② **평년값을 쓸 수 있을 것** — 자기 것이 있거나(normal_stations.csv) 빌릴 짝이 있거나
       (normal_fallback.csv). 밭 상세는 평년 대비로 판정하므로 평년값이 없으면 쓸모가 없다.

    ⚠ ②가 없으면 **산 위 레이더가 평지 밭의 관측소가 된다.** 실측이 있다고 밭 기준으로 쓸 수
    있는 것은 아니다 — "ASOS 다" 와 "밭이 쓸 수 있다" 는 다른 사실이고, 그걸 이어 붙였다가
    안양·과천 밭이 3.3km 앞 `116 관악(레)`(관악산 정상, 해발 630m)를 골랐다. 서울보다 최고기온이
    매일 3~4.6도 낮다(2026-09-10~15 실측). 17km 밖 서울·수원이 오히려 맞다.
    이 조건으로 22개가 걸러지는데 전부 레이더·도서·공항·신설이다 — 평년값 유무가 "평지의 보통
    기후를 대표하는가" 를 그대로 가려 준다. 지도와 같은 기준이 되는 것은 덤이다.

실행: py -m pipeline.farm.sync_station_obs        (DB 안에서 옮기기만. API 없음)
"""

import csv

from sqlalchemy import text

from app.core.config import DATA_DIR
from app.core.db import new_session
from pipeline.region.asos import is_asos, normal_fallback, normal_stations

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
        실측있음 = {r[0] for r in rows if is_asos(r[0])}
        # ② 평년값을 쓸 수 있는 곳만. 레이더·도서·공항이 여기서 걸러진다(docstring 참고)
        평년쓸수있음 = normal_stations() | set(normal_fallback())
        쓸것 = sorted(실측있음 & 평년쓸수있음, key=int)

        with (DATA_DIR / "stations.csv").open(encoding="utf-8-sig") as f:
            좌표 = {r["stn"]: r for r in csv.DictReader(f)}
        걸러짐 = sorted(실측있음 - 평년쓸수있음, key=int)
        쓸것 = [s for s in 쓸것 if s in 좌표]
        print(f"실측 {MIN_ROWS}행 이상 ASOS {len(실측있음)}개 · 평년값도 되는 곳 {len(쓸것)}개")
        if 걸러짐:
            목록 = ", ".join(s + " " + 좌표.get(s, {}).get("name", "") for s in 걸러짐)
            print(f"  평년값이 없어 제외 {len(걸러짐)}개: {목록}")

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

        # ── ⑤ 후보에서 빠진 관측소는 stations 에서도 뺀다 ───────────────────
        # 한 번 넣었다가 기준이 바뀌어 빠지는 경우다(관악 레이더 등). 남겨 두면 계속 뽑힌다.
        # weather_obs_daily 가 FK 로 가리키므로 관측부터 지운다 — 그 관측소를 쓰는 화면은
        # 이제 없다(밭은 다음 조회에서 더 멀지만 평지인 관측소로 옮겨 간다)
        군더더기 = [r[0] for r in db.execute(text(
            "select station_code from stations where station_code != all(:keep)"
        ), {"keep": 쓸것})]
        for s in 군더더기:
            db.execute(text("delete from weather_obs_daily where station_code = :c"), {"c": s})
            db.execute(text("delete from stations where station_code = :c"), {"c": s})
        if 군더더기:
            db.commit()
            print(f"  후보에서 빠진 관측소 {len(군더더기)}개 제거")

        # ── ⑥ 관측이 하나도 없는 관측소는 stations 에서 뺀다 ────────────────
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
