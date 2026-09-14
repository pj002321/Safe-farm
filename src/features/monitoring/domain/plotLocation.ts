import type { LatLon } from "./geo";

/**
 * ---------------------------------------------
 * [Feature]: 밭 좌표 검증
 *
 * [Description]
 * - 지도는 지구 전체를 보여주므로 사용자가 국외를 찍을 수 있다. 이 서비스의 자료
 *   출처(기상청 API허브 · 국토위성 · 농촌진흥청)는 전부 국내만 덮으므로, 국외
 *   좌표로 등록된 밭은 영영 데이터가 비는 유령이 된다. 받는 순간 거른다.
 * - **사각형 여러 개로 본다.** 국경선 다각형은 정확하지만 경계 데이터를 싣고
 *   점-다각형 판정을 돌려야 한다. 다만 **사각형 하나로는 안 된다** — 마라도(33.1N)와
 *   독도(131.9E)를 함께 담는 사각형은 그 사이의 대마도와 규슈 북부까지 삼킨다.
 *   대마도는 거제도 바로 옆에 보여 실제로 오클릭이 난다(실측으로 확인했다).
 *   그래서 경도 129° 동쪽은 위도 35° 이북만 연다.
 * - **문구를 코드와 같은 파일에 둔다.** 화면마다 다르게 쓰면 같은 오류가 페이지에
 *   따라 다른 말로 나온다.
 * - `LatLon` 을 재사용한다. 지구본·위성 모듈과 같은 타입을 써야 등록된 밭을
 *   그대로 지구본에 찍을 수 있다.
 *
 * [Usage]
 * ```ts
 * const issue = validatePlotLocation(coord);
 * if (issue) return { error: PLOT_LOCATION_MESSAGE[issue] };
 * ```
 * ---------------------------------------------
 */

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * 국내 영역을 덮는 사각형들. 하나라도 걸리면 국내로 본다.
 *
 * 넷으로 나눈 이유는 대마도다. 위도 34.0~34.8 · 경도 129.1~129.6 에 있어,
 * 마라도와 독도를 함께 담는 사각형 하나에는 반드시 포함된다. 지도에서 거제도
 * 바로 옆에 보이므로 오클릭이 실제로 난다.
 *
 * 그래서 경도 129° 를 기준으로 남쪽 문을 닫았다. 그 동쪽에서 국내 육지는
 * 부산(35.18N)부터 시작하므로 위도 35° 이북만 연다.
 */
const KOREA_BOXES: readonly BoundingBox[] = [
  // 본토와 서·남해 도서. 백령도(38.0N/124.7E) ~ 가거도(34.1N/125.1E) ~ 거제도.
  { minLat: 33.9, maxLat: 38.7, minLon: 124.5, maxLon: 129.0 },
  // 제주도와 마라도(33.06N).
  { minLat: 33.0, maxLat: 33.7, minLon: 126.0, maxLon: 127.0 },
  // 동해안 부산·울산·포항. 위도 35° 아래는 대마도라 열지 않는다.
  { minLat: 35.0, maxLat: 38.7, minLon: 129.0, maxLon: 130.0 },
  // 울릉도(37.5N/130.9E)와 독도(37.24N/131.87E).
  { minLat: 37.0, maxLat: 37.8, minLon: 130.5, maxLon: 132.0 },
];

export type PlotLocationIssue = "missing" | "not-finite" | "outside-korea";

function isInBox(coord: LatLon, box: BoundingBox): boolean {
  return (
    coord.lat >= box.minLat &&
    coord.lat <= box.maxLat &&
    coord.lon >= box.minLon &&
    coord.lon <= box.maxLon
  );
}

export function isInKorea(coord: LatLon): boolean {
  return KOREA_BOXES.some((box) => isInBox(coord, box));
}

/** 문제가 없으면 null. 있으면 무엇이 문제인지 돌려준다. */
export function validatePlotLocation(
  coord: LatLon | null,
): PlotLocationIssue | null {
  if (!coord) return "missing";

  // NaN 은 모든 비교에서 false 라 범위 검사를 그냥 통과한다. 먼저 막는다.
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) {
    return "not-finite";
  }

  if (!isInKorea(coord)) return "outside-korea";

  return null;
}

/** 사용자에게 그대로 보여줄 문구. 화면은 이 표만 읽는다. */
export const PLOT_LOCATION_MESSAGE: Record<PlotLocationIssue, string> = {
  missing: "지도를 클릭해 밭 위치를 찍어 주세요.",
  "not-finite": "좌표를 읽지 못했습니다. 지도를 다시 클릭해 주세요.",
  "outside-korea":
    "국내 좌표만 등록할 수 있습니다. 기상·위성 자료가 국내만 제공됩니다.",
};
