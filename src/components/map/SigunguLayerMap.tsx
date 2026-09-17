"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CloudRainIcon,
  SnowflakeIcon,
  SunIcon,
  TyphoonIcon,
  WindIcon,
} from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import type {
  SigunguGddFeatureCollection,
  SigunguRainFeatureCollection,
  SigunguWarnFeatureCollection,
  SigunguWindFeatureCollection,
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
const POLL_MS = 5 * 60 * 1000;

type Layer = "gdd" | "warn" | "rain" | "wind";
type GddProperties =
  SigunguGddFeatureCollection["features"][number]["properties"];
type WarnProperties =
  SigunguWarnFeatureCollection["features"][number]["properties"];
type RainProperties =
  SigunguRainFeatureCollection["features"][number]["properties"];
type WindProperties =
  SigunguWindFeatureCollection["features"][number]["properties"];

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
  | { layer: "warn"; name: string; properties: WarnProperties }
  | { layer: "rain"; name: string; properties: RainProperties }
  | { layer: "wind"; name: string; properties: WindProperties };

export function SigunguLayerMap() {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [layer, setLayer] = useState<Layer>("gdd");
  const [gddData, setGddData] = useState<SigunguGddFeatureCollection | null>(
    null,
  );
  const [warnData, setWarnData] = useState<SigunguWarnFeatureCollection | null>(
    null,
  );
  const [rainData, setRainData] = useState<SigunguRainFeatureCollection | null>(
    null,
  );
  const [windData, setWindData] = useState<SigunguWindFeatureCollection | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);

  // 특보·관측은 배치가 새로 돌면 화면을 안 새로고침해도 바뀐다 — 그 변화를
  // 실제로 반영해야 "실시간" 이지, 정적으로 한 번 그려두면 흉내일 뿐이다.
  // 이미 한 번 띄운 뒤엔 주기 조회가 실패해도 에러로 덮지 않는다 — 잠깐의
  // 네트워크 흔들림 때문에 잘 보이던 지도가 사라지면 안 된다.
  useEffect(() => {
    let loadedOnce = false;
    const load = () =>
      Promise.all([
        fetch("/api/map/sigungu-gdd").then((res) => res.json()),
        fetch("/api/map/sigungu-warn").then((res) => res.json()),
        fetch("/api/map/sigungu-rain").then((res) => res.json()),
        fetch("/api/map/sigungu-wind").then((res) => res.json()),
      ])
        .then(([gdd, warn, rain, wind]) => {
          // ai-service 미연결("not-configured")도 200으로 온다 — features 유무로 가른다.
          if ("features" in gdd) setGddData(gdd);
          else if (!loadedOnce) setError(true);
          if ("features" in warn) setWarnData(warn);
          if ("features" in rain) setRainData(rain);
          if ("features" in wind) setWindData(wind);
          loadedOnce = true;
        })
        .catch(() => {
          if (!loadedOnce) setError(true);
        });

    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layer 는 재실행 신호다 — 레이어를 바꾸면 이전 선택 정보를 지운다.
  useEffect(() => {
    setSelected(null);
  }, [layer]);

  useEffect(() => {
    if (status !== "ready") return;
    const data =
      layer === "gdd"
        ? gddData
        : layer === "warn"
          ? warnData
          : layer === "rain"
            ? rainData
            : windData;
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
        setSelected({
          layer,
          name: feature.properties.name,
          properties: feature.properties,
        } as Selected);
      });
    }

    // 레이어를 바꾸면 이전 레이어의 폴리곤을 지운다 — 같은 지도 인스턴스를 재사용하므로
    // 지우지 않으면 두 레이어가 겹쳐 칠해진다.
    return () => {
      for (const overlay of overlays) overlay.setMap(null);
    };
  }, [status, layer, gddData, warnData, rainData, windData]);

  if (error) {
    return (
      <p className="text-fg-muted text-sm">
        지역 기상 지도를 불러오지 못했습니다. ai-service
        연결(AI_SERVICE_URL/AI_SERVICE_TOKEN)을 확인해 주세요.
      </p>
    );
  }

  const asOf =
    layer === "gdd"
      ? gddData?.asOf
      : layer === "warn"
        ? warnData?.asOf
        : layer === "rain"
          ? rainData?.asOf
          : windData?.asOf;
  const hasWarning = warnData?.features.some((f) => f.properties.color) ?? true;

  return (
    <div className="flex flex-col gap-3">
      <KakaoSdkScript onStatusChange={setStatus} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LayerToggle layer={layer} onChange={setLayer} />
        <LiveIndicator />
      </div>
      {layer === "warn" && warnData && <WarningIconRow data={warnData} />}
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

/** 정적인 색칠 지도로는 "지금도 갱신되고 있다"는 게 안 느껴져서 붙인 맥박 표시. */
function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-subtle text-xs">
      <span className="relative grid size-2 place-items-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-telemetry" />
        <span className="size-1.5 rounded-full bg-telemetry" />
      </span>
      실시간 반영 중
    </span>
  );
}

/** 특보 종류마다 아이콘을 붙인다. 못 아는 종류(건조·풍랑 등)는 경고 삼각형으로 받는다. */
const WARN_KIND_ICONS: Record<string, typeof AlertTriangleIcon> = {
  태풍: TyphoonIcon,
  강풍: WindIcon,
  호우: CloudRainIcon,
  대설: SnowflakeIcon,
  한파: SnowflakeIcon,
  폭염: SunIcon,
};

/** 전국에서 지금 발효 중인 특보 종류를 중복 없이 뽑아 아이콘 배지로 보여준다. */
function WarningIconRow({ data }: { data: SigunguWarnFeatureCollection }) {
  const kinds: string[] = [];
  for (const feature of data.features) {
    for (const kind of feature.properties.warnings ?? []) {
      if (!kinds.includes(kind)) kinds.push(kind);
    }
  }
  if (kinds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((kind) => {
        const Icon = WARN_KIND_ICONS[kind] ?? AlertTriangleIcon;
        return (
          <Badge
            icon={<Icon className="size-3.5" />}
            key={kind}
            tone="unsuitable"
          >
            {kind} 특보
          </Badge>
        );
      })}
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
      <ToggleButton active={layer === "rain"} onClick={() => onChange("rain")}>
        강수량
      </ToggleButton>
      <ToggleButton active={layer === "wind"} onClick={() => onChange("wind")}>
        바람
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

// app/domain/weather_region.py 의 강수·바람 등급과 색을 그대로 맞춘다.
const RAIN_LEGEND_ITEMS = [
  { color: "#dbeafe", labelKo: "강수 없음" },
  { color: "#93c5fd", labelKo: "약한 비" },
  { color: "#3b82f6", labelKo: "보통 비" },
  { color: "#f97316", labelKo: "강한 비" },
  { color: "#dc2626", labelKo: "매우 강한 비" },
  { color: GDD_DEFAULT_COLOR, labelKo: "데이터 없음" },
];

const WIND_LEGEND_ITEMS = [
  { color: "#a7f3d0", labelKo: "약함" },
  { color: "#6ee7b7", labelKo: "약간 강함" },
  { color: "#fdba74", labelKo: "강함" },
  { color: "#f97316", labelKo: "강풍주의보 수준" },
  { color: "#dc2626", labelKo: "강풍경보 수준" },
  { color: GDD_DEFAULT_COLOR, labelKo: "데이터 없음" },
];

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
      : layer === "warn"
        ? [{ color: WARN_COLOR, labelKo: "발효 중인 특보" }]
        : layer === "rain"
          ? RAIN_LEGEND_ITEMS
          : WIND_LEGEND_ITEMS;

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
      ) : selected.layer === "warn" ? (
        <p className="text-fg-muted">{selected.properties.label}</p>
      ) : selected.layer === "rain" ? (
        <p className="text-fg-muted">
          {selected.properties.rainMm != null
            ? `${selected.properties.rainMm}mm`
            : "데이터 없음"}{" "}
          · {selected.properties.label}
        </p>
      ) : (
        <p className="text-fg-muted">
          {selected.properties.windMax != null
            ? `${selected.properties.windMax}m/s`
            : "데이터 없음"}{" "}
          · {selected.properties.label}
        </p>
      )}
    </div>
  );
}
