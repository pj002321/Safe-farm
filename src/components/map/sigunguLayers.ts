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
