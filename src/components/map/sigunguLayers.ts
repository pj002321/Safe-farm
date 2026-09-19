import type {
  SigunguGddFeatureCollection,
  SigunguRainFeatureCollection,
  SigunguWarnFeatureCollection,
  SigunguWindFeatureCollection,
} from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 지도 레이어 — 타입과 상수
 *
 * [Description]
 * - 지도 컴포넌트가 500줄을 넘어가서 갈라냈다. 여기에는 **모양과 값**만 두고
 *   그리는 일은 컴포넌트가 한다.
 * - 레이어 이름이 한 곳에 있어야 토글 버튼·로딩 문구·실패 문구가 같은 말을 쓴다.
 * ---------------------------------------------
 */

export const MAP_CONTAINER_ID = "sigungu-layer-map-canvas";
export const NATIONWIDE_LEVEL = 13;
export const NATIONWIDE_CENTER = { lat: 36.4, lng: 127.9 };
/**
 * 밭을 중심에 두고 열 때의 배율(축척 약 2km).
 *
 * 예전 텃밭 지도는 4(약 100m)였다. 필지는 잘 보이지만 시군구 폴리곤이
 * 화면을 통째로 덮어 색이 무슨 뜻인지 알 수 없다. 반대로 전국(13)에서는
 * 시군구 250개 중 227개가 44px 미만이라 손가락으로 고를 수 없다.
 * 8은 마을과 내 밭 핀이 같이 보이면서 옆 시군구 색까지 들어오는 지점이다.
 */
export const PLOT_VIEW_LEVEL = 8;
export const GDD_DEFAULT_COLOR = "#d1d5db";
export const POLL_MS = 5 * 60 * 1000;

export type Layer = "gdd" | "warn" | "rain" | "wind";

/**
 * 레이어 이름. 토글 버튼과 로딩 문구가 **같은 말**을 쓰도록 한 곳에 둔다.
 *
 * `short` 가 따로 있는 이유: 긴 이름 넷을 한 줄에 놓으면 375px 에서 343px 가
 * 필요한데 가용 폭은 327px 다. 16px 가 모자라 네 버튼이 **전부 두 줄로 깨졌다**
 * (한글은 음절 단위로 끊긴다). 좁은 화면에서는 짧은 이름을 쓴다.
 */
export const LAYER_LABEL: Record<Layer, string> = {
  gdd: "생육 기상(GDD)",
  warn: "기상특보",
  rain: "강수량",
  wind: "바람",
};

export const LAYER_SHORT: Record<Layer, string> = {
  gdd: "생육",
  warn: "특보",
  rain: "비",
  wind: "바람",
};
export type GddProperties =
  SigunguGddFeatureCollection["features"][number]["properties"];
export type WarnProperties =
  SigunguWarnFeatureCollection["features"][number]["properties"];
export type RainProperties =
  SigunguRainFeatureCollection["features"][number]["properties"];
export type WindProperties =
  SigunguWindFeatureCollection["features"][number]["properties"];

export interface Geometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

/** Polygon/MultiPolygon 의 외곽 고리들만 뽑는다(구멍 무시) — 기존 두 지도와 동일 규칙. */
export function outerRings(geometry: Geometry): number[][][] {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return [coords[0]];
  }
  const coords = geometry.coordinates as number[][][][];
  return coords.map((polygon) => polygon[0]);
}

/** 외곽 고리들의 경계상자 한가운데. 화살표를 대충 그 지역 한가운데 놓는 용도다.
 *
 * ⚠️ **점들의 평균이 아니라 경계상자 중심을 쓴다.** 해안선이 낀 시군구는 그
 * 쪽 좌표점 밀도가 내륙 직선 경계보다 훨씬 높아서, 점을 그냥 평균 내면
 * 무게중심이 바다 쪽으로 쏠려 폴리곤 바깥(심하면 화면 밖)으로 나간다(실측).
 */
export function centroid(geometry: Geometry): { lat: number; lng: number } {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const ring of outerRings(geometry)) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}
