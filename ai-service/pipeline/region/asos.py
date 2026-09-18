"""평년값을 기대할 수 있는 관측소(ASOS) 만 고른다.

⚠ 이 판단을 DB(normals) 로 하면 안 된다. normals 를 보고 후보를 정하면, 그 normals 를
채우는 fetch_all_normals 가 다시 이 결과를 입력으로 삼아 **순환**이 된다 — 한번 빠진
관측소는 재실행으로도 영원히 못 돌아온다. 제주 관측소 넷이 그렇게 빠져 제주도가 전남
강진군을 봤다(이슈/제주_관측소_후보에서_탈락.md).

그래서 DB 를 읽지 않고 기상청 지점번호로 가른다. 종관기상관측(ASOS)은 300 번 미만,
방재기상관측(AWS)은 300 번 이상이다. 번호 체계는 기상청이 정한 고정된 사실이라
우리 DB 상태에 흔들리지 않는다 — 그 점이 이 규칙의 전부다.

⚠ **ASOS 라고 평년값이 있는 것은 아니다.** 2026-09-18 실측: ASOS 121개 중 37개가
1991~2020 평년값을 못 받는다(기상청이 result=ok · data=[] 로 답한다).
  공항 12 — 김포·인천·청주·대구·울산·김해·광주·사천·무안·여수·포항·양양. 항공기상청 소관이라
             지상관측 평년값 체계에 없다
  레이더 3 · 도서 4 — 관악·부산·진도 / 독도·북격렬비도·안마도·덕적북리
  신설 16 — 세종·북춘천·서청주·고창군·북창원·보성군·광양시·북부산 등 2010년대 신설이라
             30년 연속 관측이 없다
  이전 2  — 143 대구·146 전주. 1981~2010(tmst=2011)에는 있지만 관측소 이전으로
             1991~2020 이 끊겼다. 기준이 다른 값을 섞으면 평년 비교가 어긋나므로 쓰지 않는다

그래서 번호만으로 후보를 정하면 250개 시군구 중 76개가 평년값 없는 관측소에 배정돼
지도가 회색이 된다(실측). 후보는 ASOS 이면서 **실제로 평년값을 받아 둔 곳**이어야 한다 —
그 목록이 data/ref/normal_stations.csv 이고, fetch_all_normals 가 받아 본 결과로 갱신한다.
map 은 그 목록을 읽기만 하므로 고리는 여전히 닫히지 않는다.
"""

import csv

from app.core.config import DATA_DIR

ASOS_MAX_STN = 300
NORMAL_STATIONS_PATH = DATA_DIR / "ref" / "normal_stations.csv"
NORMAL_FALLBACK_PATH = DATA_DIR / "ref" / "normal_fallback.csv"
NO_RAIN_PATH = DATA_DIR / "ref" / "no_rain_stations.csv"
EXCLUDED_PATH = DATA_DIR / "ref" / "excluded_stations.csv"


def is_asos(stn: str | int) -> bool:
    """지점번호가 ASOS 대역인가. CSV 에서 읽으면 문자열이라 int 로 맞춰 비교한다."""
    return int(stn) < ASOS_MAX_STN


def asos_only(stations: list[dict], key: str = "stn") -> list[dict]:
    """관측소 dict 목록에서 ASOS 만 남긴다.

    key 를 받는 이유는 CSV 마다 컬럼 이름이 다르기 때문이다 — stations.csv 는 `stn`,
    master/stations.csv 는 `station_code` 다.
    """
    return [s for s in stations if is_asos(s[key])]


def normal_stations() -> set[str]:
    """평년값을 실제로 받아 둔 관측소 번호. 파일이 없으면 빈 집합.

    이 목록은 fetch_all_normals 가 121개를 다 시도해 본 결과다. DB 가 아니라 파일을 읽으므로
    적재가 실패한 날에도 후보가 흔들리지 않는다 — 순환을 피하면서 사실을 반영하는 자리다.
    """
    if not NORMAL_STATIONS_PATH.exists():
        return set()
    with NORMAL_STATIONS_PATH.open(encoding="utf-8-sig") as f:
        return {row["stn"] for row in csv.DictReader(f) if row.get("stn")}


def save_normal_stations(stations: list[dict], key: str = "stn") -> int:
    """평년값을 받아 둔 관측소 목록을 파일로 남긴다. fetch_all_normals 가 끝에 부른다."""
    with NORMAL_STATIONS_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["stn", "name"])
        for s in sorted(stations, key=lambda x: int(x[key])):
            writer.writerow([s[key], s.get("name", "")])
    return len(stations)


def normal_fallback() -> dict[str, str]:
    """평년값이 없는 관측소 → 평년값을 빌려올 관측소. 파일이 없으면 빈 dict.

    normal_fallback.py 가 올해 실측으로 닮음을 재서 만든다(규칙은 그 파일 docstring).
    여기 있는 관측소는 실측은 자기 것을 쓰고 평년값만 짝의 것을 쓴다.
    """
    if not NORMAL_FALLBACK_PATH.exists():
        return {}
    with NORMAL_FALLBACK_PATH.open(encoding="utf-8-sig") as f:
        return {row["stn"]: row["normal_stn"] for row in csv.DictReader(f) if row.get("stn")}


def usable(stations: list[dict], key: str = "stn") -> list[dict]:
    """지도·밭이 쓸 수 있는 관측소만 남긴다. 조건 셋을 다 넘어야 한다.

    ⚠ **"실측이 있다" 와 "밭 기준으로 쓸 수 있다" 는 다른 사실이다.** 이걸 이어 붙였다가
    세 번 틀렸다. 조건마다 걸러지는 것이 다르다.

      ① 평년값을 쓸 수 있을 것 — 없으면 GDD 편차를 못 낸다(with_normals)
      ② 강수를 관측할 것 — 142 대구(공)·153 김해(공)·158 광주(공)·161 사천(공) 은 261일 내내
         기온·바람만 있고 rain 이 전부 NULL 이다(실측). 공항 관측은 강수를 항공기상 쪽으로만
         보고한다. 배정되면 그 시군구의 강수 칸이 통째로 빈다.
         목록은 no_rain_stations.csv — fetch_region_weather 가 받아 본 결과로 갱신한다.
      ③ 평지의 보통 기후를 대표할 것 — excluded_stations.csv 의 명시적 제외.

    ⚠ ③ 을 데이터로 판정하려다 두 번 실패했다. "평년값 유무" 로는 부산 레이더가 3.3km 앞
    부산에서 빌려 통과했고 대관령은 자기 평년값이 있어 통과했다. "이웃과 다른 정도" 로는
    105 강릉(+48.6%)이 최상위로 뜬다 — 이웃이 대관령·북강릉뿐이라 상대적으로 튄 것이지
    강릉은 정상적인 평지 관측소다. 반대로 장수·태백·제천처럼 실제 산간인 정상 관측소도 아래에
    섞인다. **기후가 다른 것이 정상인 곳이 많아 "다르다" 가 기준이 못 된다.**
    실제 구분은 관측소 종류(레이더·원양도서·고지대)이고 그건 자동 판정이 안 된다.
    그래서 사람이 정하고 근거를 파일에 적는다. 관측소가 늘면 그때 사람이 본다.
    """
    빼기 = no_rain_stations() | excluded_stations()
    return [s for s in with_normals(stations, key) if s[key] not in 빼기]


def excluded_stations() -> set[str]:
    """평지 밭의 기준이 될 수 없어 손으로 뺀 관측소. 파일이 없으면 빈 집합.

    reason 칸에 왜 뺐는지가 적혀 있다 — 지우거나 되살릴 때 그 근거를 먼저 본다.
    """
    if not EXCLUDED_PATH.exists():
        return set()
    with EXCLUDED_PATH.open(encoding="utf-8-sig") as f:
        return {row["stn"] for row in csv.DictReader(f) if row.get("stn")}


def no_rain_stations() -> set[str]:
    """강수를 관측하지 않는 관측소 번호. 파일이 없으면 빈 집합."""
    if not NO_RAIN_PATH.exists():
        return set()
    with NO_RAIN_PATH.open(encoding="utf-8-sig") as f:
        return {row["stn"] for row in csv.DictReader(f) if row.get("stn")}


def save_no_rain_stations(stations: list[dict], key: str = "stn") -> int:
    """강수를 관측하지 않는 관측소 목록을 파일로 남긴다. fetch_region_weather 가 끝에 부른다."""
    with NO_RAIN_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["stn", "name"])
        for s in sorted(stations, key=lambda x: int(x[key])):
            writer.writerow([s[key], s.get("name", "")])
    return len(stations)


def with_normals(stations: list[dict], key: str = "stn") -> list[dict]:
    """ASOS 이면서 평년값을 **쓸 수 있는** 관측소만 남긴다 — 자기 것이 있거나, 빌려올 짝이 있거나.
    목록 파일이 없으면 ASOS 전체를 준다 — 최초 1회(목록을 아직 안 만든 상태)에 후보가 0 이 되어
    매핑이 통째로 깨지는 것을 막는다.
    """
    있는것 = normal_stations() | set(normal_fallback())
    asos = asos_only(stations, key)
    return [s for s in asos if s[key] in 있는것] or asos
