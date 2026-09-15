"use client";

import { useEffect, useState } from "react";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";
import type { SigunguGddFeatureCollection } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 누적 GDD 평년 대비 편차 색칠 지도 (V1-37)
 *
 * [Description]
 * - `/api/map/sigungu-gdd` 가 준 GeoJSON 을 그대로 폴리곤으로 그린다. 색·등급
 *   판정은 전부 ai-service(`app/domain/gdd.py`)가 끝내 놓은 값이라 여기서는
 *   `properties.color` 를 칠하기만 한다 — 프론트가 임계값을 다시 판단하지 않는다.
 * - 시군구는 대부분 Polygon 이지만 섬이 딸린 지역은 MultiPolygon 이다. 둘 다
 *   **외곽 고리만** 그린다(구멍 있는 지형은 없어 첫 ring 으로 충분하다).
 * - 평년값이 없는 관측소(AWS 다수, `arcltr_sfc_norm` 미지원)에 걸린 시군구는
 *   `color` 가 회색(데이터 없음)으로 내려온다 — 프론트는 그 값을 그대로 칠하면 된다.
 * ---------------------------------------------
 */

const MAP_CONTAINER_ID = "sigungu-gdd-map-canvas";

/** 전국이 한 화면에 들어오는 확대 수준. */
const NATIONWIDE_LEVEL = 13;
const NATIONWIDE_CENTER = { lat: 36.4, lng: 127.9 };

const DEFAULT_COLOR = "#d1d5db";

type Feature = SigunguGddFeatureCollection["features"][number];

/** Polygon/MultiPolygon 의 외곽 고리들만 뽑는다(구멍 무시). */
function outerRings(geometry: Feature["geometry"]): number[][][] {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return [coords[0]];
  }
  const coords = geometry.coordinates as number[][][][];
  return coords.map((polygon) => polygon[0]);
}

interface SelectedRegion {
  name: string;
  properties: Feature["properties"];
}

export function SigunguGddMap() {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [data, setData] = useState<SigunguGddFeatureCollection | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<SelectedRegion | null>(null);

  useEffect(() => {
    fetch("/api/map/sigungu-gdd")
      .then((res) => res.json())
      .then((json: SigunguGddFeatureCollection | { error: string }) => {
        // ai-service 미연결("not-configured")도 200으로 온다 — features 유무로 가른다.
        if ("features" in json) setData(json);
        else setError(true);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (status !== "ready" || !data) return;

    const container = document.getElementById(MAP_CONTAINER_ID);
    const sdk = window.kakao;
    if (!container || !sdk) return;

    const map = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(
        NATIONWIDE_CENTER.lat,
        NATIONWIDE_CENTER.lng,
      ),
      level: NATIONWIDE_LEVEL,
    });

    for (const feature of data.features) {
      const path = outerRings(feature.geometry).map((ring) =>
        ring.map(([lng, lat]) => new sdk.maps.LatLng(lat, lng)),
      );

      const polygon = new sdk.maps.Polygon({
        path,
        fillColor: feature.properties.color ?? DEFAULT_COLOR,
        fillOpacity: 0.6,
        strokeWeight: 1,
        strokeColor: "#ffffff",
        strokeOpacity: 0.8,
      });
      polygon.setMap(map);

      sdk.maps.event.addListener(polygon, "click", () => {
        setSelected({ name: feature.properties.name, properties: feature.properties });
      });
    }
  }, [status, data]);

  if (error) {
    return (
      <p className="text-fg-muted text-sm">
        지역 기상 지도를 불러오지 못했습니다. ai-service 연결(AI_SERVICE_URL/AI_SERVICE_TOKEN)을
        확인해 주세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <KakaoSdkScript onStatusChange={setStatus} />
      <div
        className="h-[24rem] w-full overflow-hidden rounded-lg border border-border sm:h-[28rem]"
        id={MAP_CONTAINER_ID}
      />
      <Legend />
      {selected && <RegionInfo region={selected} />}
    </div>
  );
}

const LEGEND_ITEMS = [
  { color: "#2563eb", labelKo: "평년보다 낮음" },
  { color: "#93c5fd", labelKo: "평년과 비슷(낮은 쪽)" },
  { color: "#fdba74", labelKo: "평년과 비슷(높은 쪽)" },
  { color: "#dc2626", labelKo: "평년보다 높음" },
  { color: DEFAULT_COLOR, labelKo: "데이터 없음" },
];

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-fg-muted text-xs">
      {LEGEND_ITEMS.map((item) => (
        <span className="flex items-center gap-1.5" key={item.color}>
          <span
            className="size-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.labelKo}
        </span>
      ))}
    </div>
  );
}

function RegionInfo({ region }: { region: SelectedRegion }) {
  const { properties } = region;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="font-medium text-fg">{region.name}</p>
      {properties.deviationPct != null ? (
        <p className="text-fg-muted">
          누적 {properties.actualGdd}GDD (평년 {properties.normalGdd}GDD,{" "}
          {properties.deviationPct > 0 ? "+" : ""}
          {properties.deviationPct}%) · {properties.label}
        </p>
      ) : (
        <p className="text-fg-muted">{properties.label ?? "데이터 없음"}</p>
      )}
    </div>
  );
}
