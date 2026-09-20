"use client";

import { useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRightIcon } from "@/components/icons";
import type { SigunguWindFeatureCollection } from "@/shared/aiService/client";
import type { Layer } from "./sigunguLayers";
import type { LayerState } from "./useSigunguLayer";
import { interpolateDeg, stationSamples } from "./windField";

/**
 * ---------------------------------------------
 * [Feature]: 바람 화살표 — 지도 위에서 부는 방향을 보여준다 (Windy 식 격자)
 *
 * [Description]
 * - 관측소는 100개뿐이라 관측소 위치에만 화살표를 두면 화면 대부분이 빈다
 *   (실측). 대신 **현재 화면 범위를 격자로 나눠** 각 격자점 방향을 가까운
 *   관측소들로 보간(`windField.ts`)해 채운다 — 어디를 보고 있든 화면 전체가
 *   화살표로 덮인다.
 * - 격자는 확대/축소·드래그가 끝날 때(`idle`)마다 현재 범위로 다시 그린다.
 * - 방향은 "불어오는" 값(기상학 관례)을 180° 돌려 "불어가는" 쪽을 가리킨다.
 *   회전은 바깥 div 가 고정으로 맡고, 안쪽 아이콘이 `animate-wind-flow` 로
 *   제 축을 따라 흔들려 흐르는 느낌을 낸다(globals.css 참고).
 *
 * [Usage]
 * ```tsx
 * useWindArrows({ map, layer, data: current });
 * ```
 * ---------------------------------------------
 */

// ponytail: 고정 8x6 격자. 실측 지점이 100개뿐이라 더 촘촘히 그려봐야
// 허수 정밀도만 늘어난다 — 관측소 수가 늘면 격자도 키운다.
const GRID_COLS = 8;
const GRID_ROWS = 6;

function arrowElement(windDeg: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.transform = `rotate(${windDeg + 90}deg)`;
  el.innerHTML = renderToStaticMarkup(
    <div className="animate-wind-flow text-accent drop-shadow">
      <ArrowRightIcon className="size-4" />
    </div>,
  );
  return el;
}

export function useWindArrows({
  map,
  layer,
  data,
}: {
  map: kakao.maps.Map | null;
  layer: Layer;
  data: LayerState;
}): void {
  useEffect(() => {
    const sdk = window.kakao;
    if (!map || !sdk || layer !== "wind" || !data || data === "error") return;

    const samples = stationSamples(data as SigunguWindFeatureCollection);
    if (samples.length === 0) return;

    let overlays: kakao.maps.CustomOverlay[] = [];

    const draw = () => {
      for (const overlay of overlays) overlay.setMap(null);
      overlays = [];

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          const lat =
            sw.getLat() +
            ((ne.getLat() - sw.getLat()) * (row + 0.5)) / GRID_ROWS;
          const lng =
            sw.getLng() +
            ((ne.getLng() - sw.getLng()) * (col + 0.5)) / GRID_COLS;
          const deg = interpolateDeg(samples, lat, lng);
          if (deg == null) continue;

          const overlay = new sdk.maps.CustomOverlay({
            position: new sdk.maps.LatLng(lat, lng),
            content: arrowElement(deg),
            yAnchor: 0.5,
          });
          overlay.setMap(map);
          overlays.push(overlay);
        }
      }
    };

    draw();
    sdk.maps.event.addListener(map, "idle", draw);

    return () => {
      sdk.maps.event.removeListener(map, "idle", draw);
      for (const overlay of overlays) overlay.setMap(null);
    };
  }, [map, layer, data]);
}
