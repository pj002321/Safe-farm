"""시군구(sigungu.geojson)를 특보구역(warn_regions.csv)에 붙여 data/ref/sigungu_warn_region.csv 로
고정.

특보구역엔 폴리곤이 없다(코드·이름·상하위 관계표뿐, 414행 — 육상 301 / 해상 113). 그래서 시군구
폴리곤을 그대로 쓰고, 이름이 정확히 같은 특보구역을 찾아 잇는다.

**단위가 안 맞는 곳이 있다.** 서울은 시군구 25개(종로구·중구...) 대신 "서울동남권" 등 4개
권역으로만 쪼개져 있고, 반대로 곡성군은 "곡성북부/곡성남부"로 시군구보다 더 잘게 쪼개진다.
이름이 정확히 안 맞으면 시군구 코드 앞 2자리(통계청 시도 코드)로 상위 시도 특보구역까지
대체한다 — V1-37 map_stations_to_sigungu.py 의 "관측소 없으면 최근접으로 대체"와 같은 완화책.
중요도가 낮은 기능이라 이 근사치로 충분하다고 판단(V1-39).

실행: py -3.12 -m pipeline.region.map_sigungu_to_warn_region
"""

import csv
import json

from app.core.config import DATA_DIR

SIGUNGU_PATH = DATA_DIR / "ref" / "sigungu.geojson"
WARN_REGIONS_PATH = DATA_DIR / "warn_regions.csv"
OUT_PATH = DATA_DIR / "ref" / "sigungu_warn_region.csv"

# 통계청 시도 코드(시군구 코드 앞 2자리) → warn_regions.csv 의 시도 단위 reg_name.
# 시군구 이름이 특보구역과 정확히 안 맞을 때 이 시도 단위로 대체한다.
SIDO_BY_PREFIX = {
    "11": "서울특별시",
    "21": "부산광역시",
    "22": "대구광역시",
    "23": "인천광역시",
    "24": "광주광역시",
    "25": "대전광역시",
    "26": "울산광역시",
    "29": "세종특별자치시",
    "31": "경기도",
    "32": "강원도",
    "33": "충청북도",
    "34": "충청남도",
    "35": "전북자치도",
    "36": "전라남도",
    "37": "경상북도",
    "38": "경상남도",
    "39": "제주도",
}


def main() -> None:
    sigungu = json.loads(SIGUNGU_PATH.read_text(encoding="utf-8"))["features"]

    with WARN_REGIONS_PATH.open(encoding="utf-8-sig") as f:
        warn_regions = [row for row in csv.DictReader(f) if row["kind"] == "land"]
    by_name = {row["reg_name"]: row["reg_id"] for row in warn_regions}

    rows = []
    fallback = []
    for feature in sigungu:
        props = feature["properties"]
        name = props["name"]

        reg_id = by_name.get(name)
        method = "exact"
        if not reg_id:
            sido_name = SIDO_BY_PREFIX.get(props["code"][:2])
            reg_id = by_name.get(sido_name) if sido_name else None
            method = "sido-fallback"
            fallback.append(name)

        if not reg_id:
            raise SystemExit(f"{name}({props['code']}) 에 대응하는 특보구역을 못 찾았습니다.")

        rows.append(
            {
                "sigungu_code": props["code"],
                "sigungu_name": name,
                "reg_id": reg_id,
                "method": method,
            }
        )

    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"{OUT_PATH} 에 {len(rows)}개 시군구 저장 (시도 단위로 대체: {len(fallback)}개)")


if __name__ == "__main__":
    main()
