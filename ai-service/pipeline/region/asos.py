"""평년값을 기대할 수 있는 관측소(ASOS) 만 고른다.

⚠ 이 판단을 DB(normals) 로 하면 안 된다. normals 를 보고 후보를 정하면, 그 normals 를
채우는 fetch_all_normals 가 다시 이 결과를 입력으로 삼아 **순환**이 된다 — 한번 빠진
관측소는 재실행으로도 영원히 못 돌아온다. 제주 관측소 넷이 그렇게 빠져 제주도가 전남
강진군을 봤다(이슈/제주_관측소_후보에서_탈락.md).

그래서 DB 를 읽지 않고 기상청 지점번호로 가른다. 종관기상관측(ASOS)은 300 번 미만,
방재기상관측(AWS)은 300 번 이상이다. 번호 체계는 기상청이 정한 고정된 사실이라
우리 DB 상태에 흔들리지 않는다 — 그 점이 이 규칙의 전부다.
"""

ASOS_MAX_STN = 300


def is_asos(stn: str | int) -> bool:
    """지점번호가 ASOS 대역인가. CSV 에서 읽으면 문자열이라 int 로 맞춰 비교한다."""
    return int(stn) < ASOS_MAX_STN


def asos_only(stations: list[dict], key: str = "stn") -> list[dict]:
    """관측소 dict 목록에서 ASOS 만 남긴다.

    key 를 받는 이유는 CSV 마다 컬럼 이름이 다르기 때문이다 — stations.csv 는 `stn`,
    master/stations.csv 는 `station_code` 다.
    """
    return [s for s in stations if is_asos(s[key])]
