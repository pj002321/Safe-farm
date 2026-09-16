"use client";

import { useEffect, useState } from "react";
import type {
  SigunguGddFeatureCollection,
  SigunguWarnFeatureCollection,
} from "@/shared/aiService/client";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 레이어 지도 — GDD·기상특보 통합 (V1-40)
 *
 * [Description]
 * - 이전엔 SigunguGddMap·SigunguWarnMap 이 카카오맵 인스턴스를 각각 따로 띄웠다.
 *   두 지도가 같은 화면에 겹쳐 있으면 색이 뒤섞여 어느 레이어를 보는지 헷갈리므로,
 *   지도 인스턴스 하나에 레이어 토글을 얹어 **한 번에 하나의 레이어만** 칠한다.
 * - 두 데이터를 마운트 시 한 번에 받아 두고 캐시한다 — 토글은 다시 그리기만 할 뿐
 *   재요청하지 않는다.
 * - 범례에 데이터 기준일(`asOf`)을 함께 적는다. GDD 는 "올해 1/1~기준일 누적"이라
 *   기준일이 없으면 편차 색의 의미가 없고, 특보는 최신 스냅샷 시각이 곧 "이 정보가
 *   언제까지의 것인가"라 마찬가지로 상시 표기해야 오인을 막는다.
 * ---------------------------------------------
 */

const MAP_CONTAINER_ID = "sigungu-layer-map-canvas";
const NATIONWIDE_LEVEL = 13;
const NATIONWIDE_CENTER = { lat: 36.4, lng: 127.9 };
const GDD_DEFAULT_COLOR = "#d1d5db";

type Layer = "gdd" | "warn";
type GddProperties =
  SigunguGddFeatureCollection["features"][number]["properties"];
type WarnProperties =
  SigunguWarnFeatureCollection["features"][number]["properties"];

interface Geometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

/** Polygon/MultiPolygon 의 외곽 고리들만 뽑는다(구멍 무시) — 기존 두 지도와 동일 규칙. */
function outerRings(geometry: Geometry): number[][][] {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return [coords[0]];
  }
  const coords = geometry.coordinates as number[][][][];
  return coords.map((polygon) => polygon[0]);
}

type Selected =
  | { layer: "gdd"; name: string; properties: GddProperties }
  | { layer: "warn"; name: string; properties: WarnProperties };

export function SigunguLayerMap() {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [layer, setLayer] = useState<Layer>("gdd");
  const [gddData, setGddData] = useState<SigunguGddFeatureCollection | null>(
    null,
  );
  const [warnData, setWarnData] = useState<SigunguWarnFeatureCollection | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/map/sigungu-gdd").then((res) => res.json()),
      fetch("/api/map/sigungu-warn").then((res) => res.json()),
    ])
      .then(([gdd, warn]) => {
        // ai-service 미연결("not-configured")도 200으로 온다 — features 유무로 가른다.
        if ("features" in gdd) setGddData(gdd);
        else setError(true);
        if ("features" in warn) setWarnData(warn);
      })
      .catch(() => setError(true));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layer 는 재실행 신호다 — 레이어를 바꾸면 이전 선택 정보를 지운다.
  useEffect(() => {
    setSelected(null);
  }, [layer]);

  useEffect(() => {
    if (status !== "ready") return;
    const data = layer === "gdd" ? gddData : warnData;
    if (!data) return;

    const container = document.getElementById(MAP_CONTAINER_ID);
    const sdk = window.kakao;
    if (!container || !sdk) return;

    const map = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(NATIONWIDE_CENTER.lat, NATIONWIDE_CENTER.lng),
      level: NATIONWIDE_LEVEL,
    });

    const overlays: kakao.maps.Polygon[] = [];
    for (const feature of data.features) {
      const color = feature.properties.color;
      // 특보 없는 시군구는 안 그린다 — 대부분의 날엔 전국이 이 상태라, GDD 처럼
      // 항상 색을 칠하면 정작 봐야 할 경고가 묻힌다.
      if (layer === "warn" && !color) continue;

      const path = outerRings(feature.geometry).map((ring) =>
        ring.map(([lng, lat]) => new sdk.maps.LatLng(lat, lng)),
      );
      const polygon = new sdk.maps.Polygon({
        path,
        fillColor: color ?? GDD_DEFAULT_COLOR,
        fillOpacity: layer === "gdd" ? 0.6 : 0.5,
        strokeWeight: 1,
        strokeColor: "#ffffff",
        strokeOpacity: 0.8,
      });
      polygon.setMap(map);
      overlays.push(polygon);

      sdk.maps.event.addListener(polygon, "click", () => {
        setSelected(
          layer === "gdd"
            ? {
                layer,
                name: feature.properties.name,
                properties: feature.properties as GddProperties,
              }
            : {
                layer,
                name: feature.properties.name,
                properties: feature.properties as WarnProperties,
              },
        );
      });
    }

    // 레이어를 바꾸면 이전 레이어의 폴리곤을 지운다 — 같은 지도 인스턴스를 재사용하므로
    // 지우지 않으면 두 레이어가 겹쳐 칠해진다.
    return () => {
      for (const overlay of overlays) overlay.setMap(null);
    };
  }, [status, layer, gddData, warnData]);

  if (error) {
    return (
      <p className="text-fg-muted text-sm">
        지역 기상 지도를 불러오지 못했습니다. ai-service
        연결(AI_SERVICE_URL/AI_SERVICE_TOKEN)을 확인해 주세요.
      </p>
    );
  }

  const asOf = layer === "gdd" ? gddData?.asOf : warnData?.asOf;
  const hasWarning = warnData?.features.some((f) => f.properties.color) ?? true;

  return (
    <div className="flex flex-col gap-3">
      <KakaoSdkScript onStatusChange={setStatus} />
      <LayerToggle layer={layer} onChange={setLayer} />
      <div
        className="h-[24rem] w-full overflow-hidden rounded-lg border border-border sm:h-[28rem]"
        id={MAP_CONTAINER_ID}
      />
      <Legend asOf={asOf} layer={layer} />
      {layer === "warn" && warnData && !hasWarning && (
        <p className="text-fg-muted text-sm">
          현재 발효 중인 기상특보가 없습니다.
        </p>
      )}
      {selected && <RegionInfo selected={selected} />}
    </div>
  );
}

function LayerToggle({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
}) {
  return (
    <div className="inline-flex w-fit gap-1 rounded-lg border border-border p-1">
      <ToggleButton active={layer === "gdd"} onClick={() => onChange("gdd")}>
        생육 기상(GDD)
      </ToggleButton>
      <ToggleButton active={layer === "warn"} onClick={() => onChange("warn")}>
        기상특보
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-md px-3 py-1.5 font-medium text-sm transition-colors duration-200 ease-out-expo ${
        active ? "bg-accent text-accent-on" : "text-fg-muted hover:bg-surface-2"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const GDD_LEGEND_ITEMS = [
  { color: "#2563eb", labelKo: "평년보다 낮음" },
  { color: "#93c5fd", labelKo: "평년과 비슷(낮은 쪽)" },
  { color: "#fdba74", labelKo: "평년과 비슷(높은 쪽)" },
  { color: "#dc2626", labelKo: "평년보다 높음" },
  { color: GDD_DEFAULT_COLOR, labelKo: "데이터 없음" },
];

const WARN_COLOR = "#dc2626";

function Legend({
  layer,
  asOf,
}: {
  layer: Layer;
  asOf: string | null | undefined;
}) {
  const items =
    layer === "gdd"
      ? GDD_LEGEND_ITEMS
      : [{ color: WARN_COLOR, labelKo: "발효 중인 특보" }];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted text-xs">
      {items.map((item) => (
        <span className="flex items-center gap-1.5" key={item.color}>
          <span
            className="size-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.labelKo}
        </span>
      ))}
      <span className="text-fg-subtle">기준일 {asOf ?? "정보 없음"}</span>
    </div>
  );
}

function RegionInfo({ selected }: { selected: Selected }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="font-medium text-fg">{selected.name}</p>
      {selected.layer === "gdd" ? (
        selected.properties.deviationPct != null ? (
          <p className="text-fg-muted">
            누적 {selected.properties.actualGdd}GDD (평년{" "}
            {selected.properties.normalGdd}GDD,{" "}
            {selected.properties.deviationPct > 0 ? "+" : ""}
            {selected.properties.deviationPct}%) · {selected.properties.label}
          </p>
        ) : (
          <p className="text-fg-muted">
            {selected.properties.label ?? "데이터 없음"}
          </p>
        )
      ) : (
        <p className="text-fg-muted">{selected.properties.label}</p>
      )}
    </div>
  );
}
