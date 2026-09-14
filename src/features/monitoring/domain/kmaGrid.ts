import type { LatLon } from "./geo";

/**
 * ---------------------------------------------
 * [Feature]: 기상청 동네예보 격자 변환
 *
 * [Description]
 * - 기상청 단기예보 API 는 위경도를 받지 않는다. 전국을 5km 로 자른 격자 번호
 *   `nx`, `ny` 만 받는다. 밭을 등록하는 순간 이 번호를 함께 저장해야 이후 기상
 *   조회가 전부 이 값을 키로 쓸 수 있다.
 * - **람베르트 정각원뿔 도법(LCC)** 이다. 상수는 기상청이 배포하는 변환 예제의
 *   값을 그대로 쓴다 — 한 자리도 고치지 않는다. 지구 반경 6371.00877 은 이
 *   투영에 맞춰 정해진 값이라 다른 반경(geo.ts 의 6371)과 혼용하면 안 된다.
 * - **검산 기준점: 서울 종로(37.5665, 126.9780) → nx 60 · ny 127.** 기상청
 *   공식 문서에 실린 값이다. 이 하나가 어긋나면 상수를 잘못 옮긴 것이다.
 * - **기상청 변환 API(`nph-dfs_xy_lonlat`)를 부르지 않고 여기서 계산한다.**
 *   ai-service 의 수집 파이프라인은 그 API 를 쓴다(`pipeline/kma_client.py`).
 *   앱이 같은 길을 갈 수 없는 이유는 둘이다.
 *   ① `KMA_API_KEY` 는 `NEXT_PUBLIC_` 이 없는 **서버 전용** 값이다. 기상청 키는
 *      도메인 제한이 없어 브라우저로 내보내면 그대로 도용된다. 부르려면 우리
 *      서버를 한 번 거쳐야 한다.
 *   ② 좌표는 지도를 움직이는 내내 바뀐다(중앙 핀 방식이라 `idle` 마다 갱신).
 *      그때마다 왕복하면 격자가 늦게 떠 화면이 깜빡이고 호출 한도가 금방 마른다.
 *   같은 LCC 계산이라 결과는 같다 — API 는 이 수학을 서버에서 돌려줄 뿐이다.
 * - **대조표로는 풀 수 없다.** 기상청이 배포하는 엑셀은 "행정동 이름 → 격자"라
 *   임의 지점에 답하지 못한다. 밭은 행정동 안 아무 곳에나 있고, 큰 동은 격자
 *   여럿에 걸친다. 가장 가까운 행정동을 고르는 근사는 공식보다 부정확하다.
 * - 순수 함수다. 좌표만 있으면 네트워크 없이 계산된다.
 *
 * [Usage]
 * ```ts
 * const { nx, ny } = toKmaGrid({ lat: 36.4109, lon: 128.159 }); // 81, 102
 * ```
 * ---------------------------------------------
 */

export interface KmaGrid {
  nx: number;
  ny: number;
}

/** 기상청 배포 예제의 투영 상수. 의미를 모르면 건드리지 말 것. */
const RE = 6371.00877; // 투영에 쓰는 지구 반경 (km)
const GRID = 5.0; // 격자 간격 (km)
const SLAT1 = 30.0; // 표준 위도 1
const SLAT2 = 60.0; // 표준 위도 2
const OLON = 126.0; // 기준점 경도
const OLAT = 38.0; // 기준점 위도
const XO = 43; // 기준점 X 격자
const YO = 136; // 기준점 Y 격자

const DEG_TO_RAD = Math.PI / 180;

/**
 * 투영에서 매번 같은 값이 나오는 부분. 모듈 로드 때 한 번만 계산한다.
 * 좌표 하나 변환할 때마다 다시 세면 낭비다.
 */
const PROJECTION = (() => {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEG_TO_RAD;
  const slat2 = SLAT2 * DEG_TO_RAD;
  const olat = OLAT * DEG_TO_RAD;

  const ratio =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(ratio);

  const sf =
    (Math.tan(Math.PI * 0.25 + slat1 * 0.5) ** sn * Math.cos(slat1)) / sn;

  const ro = (re * sf) / Math.tan(Math.PI * 0.25 + olat * 0.5) ** sn;

  return { sn, sf, ro, re, olon: OLON * DEG_TO_RAD };
})();

/** 위경도를 기상청 격자 번호로. 격자는 1부터 시작하는 정수다. */
export function toKmaGrid(coord: LatLon): KmaGrid {
  const { sn, sf, ro, re, olon } = PROJECTION;

  const ra =
    (re * sf) / Math.tan(Math.PI * 0.25 + coord.lat * DEG_TO_RAD * 0.5) ** sn;

  // 날짜변경선을 넘는 각을 ±180° 안으로 되돌린다. 국내에서는 안 걸리지만
  // 이 보정이 없으면 경도 부호가 뒤집힌 입력에서 격자가 조용히 엉뚱해진다.
  let theta = coord.lon * DEG_TO_RAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}
