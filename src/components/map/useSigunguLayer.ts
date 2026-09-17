"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SigunguGddFeatureCollection,
  SigunguRainFeatureCollection,
  SigunguWarnFeatureCollection,
  SigunguWindFeatureCollection,
} from "@/shared/aiService/client";
import {
  GDD_DEFAULT_COLOR,
  type Layer,
  outerRings,
  POLL_MS,
} from "./sigunguLayers";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 레이어 — 내려받기와 폴리곤 그리기
 *
 * [Description]
 * - 화면 컴포넌트에서 갈라냈다. 여기는 **데이터와 지도 도형**만 다루고, 무엇을
 *   보여줄지는 부르는 쪽이 정한다.
 * - 보이는 레이어 하나만 받는다. 응답 하나가 3MB 대(98%가 지오메트리)라 넷을
 *   한꺼번에 받으면 12MB 가 나가는데 그중 셋은 화면에 없다.
 * - 폴링은 **특보만** 한다. GDD 는 서버가 하루 한 번 계산하고 강수·바람도 시간
 *   단위라, 5분마다 3MB 를 다시 받을 이유가 없다.
 *
 * [Usage]
 * ```tsx
 * const { current, retry } = useSigunguLayer(layer);
 * useSigunguPolygons({ map, layer, data: current, selectedCode, onSelect });
 * ```
 * ---------------------------------------------
 */

/** 레이어 하나의 상태. 실패를 **값으로** 들고 있어야 무한 로더가 안 생긴다. */
export type LayerState =
  | SigunguGddFeatureCollection
  | SigunguWarnFeatureCollection
  | SigunguRainFeatureCollection
  | SigunguWindFeatureCollection
  | "error"
  | null;

export interface SigunguLayerResult {
  current: LayerState;
  /**
   * 특보 레이어일 때의 응답. 다른 레이어를 보고 있으면 null.
   *
   * ⚠️ 여기서 단언(`as`)을 쓴다. 네 응답 타입은 필수 필드가 `code`·`name` 뿐이고
   *    나머지가 전부 선택이라 **서로 구조적으로 대입된다** — 값만 보고는 이게
   *    특보인지 GDD 인지 컴파일러도 사람도 구별할 수 없다. 구별의 근거는 값이
   *    아니라 **어떤 URL 을 불렀는가**이고, 그걸 아는 곳은 이 훅뿐이다.
   *    그래서 단언은 여기 한 번만 두고, 바깥은 좁혀진 타입만 받는다.
   */
  warn: SigunguWarnFeatureCollection | null;
  /** 실패한 레이어를 다시 받는다. 성공한 레이어에 부르면 다시 받는다. */
  retry: () => void;
}

export function useSigunguLayer(layer: Layer): SigunguLayerResult {
  const [data, setData] = useState<Record<Layer, LayerState>>({
    gdd: null,
    warn: null,
    rain: null,
    wind: null,
  });
  // 다시 받기 신호. 상태를 의존성에 넣는 대신 이 숫자를 올린다(아래 ⚠️ 참고).
  const [attempt, setAttempt] = useState(0);
  /**
   * 이미 받아 둔 레이어. **state 가 아니라 ref 인 것이 핵심이다.**
   *
   * ⚠️ 예전에는 `data` 자체를 효과의 의존성에 넣고 `if (data[layer]) return` 으로
   *    걸렀다. 그러면 첫 응답이 `data` 를 바꾸는 순간 효과가 재실행되고, 그
   *    **정리 함수가 방금 건 폴링을 끈다.** 그러고 나서 본문은 가드에 걸려
   *    새 interval 을 걸지 않는다 — 결과적으로 특보는 처음 한 번만 받고 멎었고,
   *    화면의 "실시간 반영 중" 표시는 거짓말이었다.
   *    같은 이유로 "받았는지" 여부는 렌더와 무관한 ref 에 둔다.
   */
  const loadedRef = useRef<Set<Layer>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 읽는 값이 아니라 재실행 신호다 — 다시 받기를 누르면 이 숫자만 올라가고 효과가 처음부터 돈다.
  useEffect(() => {
    let alive = true;

    const load = () =>
      fetch(`/api/map/sigungu-${layer}`)
        .then((res) => res.json())
        .then((json) => {
          if (!alive) return;
          // ai-service 미연결("not-configured")도 200 으로 온다 — features 유무로 가른다.
          const ok = "features" in json;
          if (ok) loadedRef.current.add(layer);
          setData((prev) => ({ ...prev, [layer]: ok ? json : "error" }));
        })
        .catch(() => {
          if (!alive) return;
          // 이미 띄운 뒤의 일시 장애면 보이던 지도를 유지한다.
          setData((prev) => ({ ...prev, [layer]: prev[layer] ?? "error" }));
        });

    if (!loadedRef.current.has(layer)) load();

    const interval = layer === "warn" ? setInterval(load, POLL_MS) : null;
    return () => {
      alive = false;
      if (interval) clearInterval(interval);
    };
  }, [layer, attempt]);

  const retry = useCallback(() => {
    loadedRef.current.delete(layer);
    setData((prev) => ({ ...prev, [layer]: null }));
    setAttempt((n) => n + 1);
  }, [layer]);

  const current = data[layer];
  const loaded = current !== null && current !== "error" ? current : null;

  return {
    current,
    warn: layer === "warn" ? (loaded as SigunguWarnFeatureCollection) : null,
    retry,
  };
}

interface PolygonsInput {
  /**
   * 지도 인스턴스. **ref 가 아니라 값으로 받는다.**
   *
   * ⚠️ 예전에는 부르는 쪽이 ref 에 담아 두고 이 효과의 의존성에는 데이터만 넣었다.
   *    카카오 SDK(외부 네트워크)가 우리 API 보다 느린 날이면 데이터가 먼저 도착해
   *    효과가 한 번 돌고 끝나는데, 그때 ref 는 아직 비어 있어 **폴리곤이 영영
   *    안 그려졌다.** 지도 생성은 렌더를 부르지 않으니 재시도 기회도 없었다.
   *    값으로 받으면 지도가 생긴 순간이 곧 의존성 변화라 그 창이 닫힌다.
   */
  map: kakao.maps.Map | null;
  layer: Layer;
  data: LayerState;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

/** 현재 레이어를 폴리곤으로 얹는다. 지도 자체(중심·배율)는 건드리지 않는다. */
export function useSigunguPolygons({
  map,
  layer,
  data,
  selectedCode,
  onSelect,
}: PolygonsInput): void {
  useEffect(() => {
    const sdk = window.kakao;
    if (!map || !sdk || !data || data === "error") return;

    const overlays: kakao.maps.Polygon[] = [];
    for (const feature of data.features) {
      const color = feature.properties.color;
      // 특보 없는 시군구는 안 그린다 — 대부분의 날엔 전국이 이 상태라, GDD 처럼
      // 항상 색을 칠하면 정작 봐야 할 경고가 묻힌다.
      if (layer === "warn" && !color) continue;

      const code = feature.properties.code;
      const isSelected = code === selectedCode;

      const path = outerRings(feature.geometry).map((ring) =>
        ring.map(([lng, lat]) => new sdk.maps.LatLng(lat, lng)),
      );
      const polygon = new sdk.maps.Polygon({
        path,
        fillColor: color ?? GDD_DEFAULT_COLOR,
        fillOpacity: isSelected ? 0.85 : layer === "gdd" ? 0.6 : 0.5,
        // 고른 곳을 **테두리로** 표시한다. 시군구 250개 중 227개가 44px 미만이라
        // 손가락으로 정확히 누르기 어렵다 — 표시가 없으면 아래 카드의 숫자가
        // 내가 누른 곳 것인지 옆 동네 것인지 알 방법이 없다.
        strokeWeight: isSelected ? 3 : 1,
        strokeColor: isSelected ? "#111111" : "#ffffff",
        strokeOpacity: isSelected ? 1 : 0.8,
      });
      polygon.setMap(map);
      overlays.push(polygon);

      sdk.maps.event.addListener(polygon, "click", () => onSelect(code));
    }

    return () => {
      for (const overlay of overlays) overlay.setMap(null);
    };
  }, [map, layer, data, selectedCode, onSelect]);
}
