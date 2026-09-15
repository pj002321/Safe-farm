"use client";

import { useEffect, useState } from "react";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";
import type { SigunguWarnFeatureCollection } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 기상특보 오버레이 지도 (V1-39)
 *
 * [Description]
 * - `/api/map/sigungu-warn` 이 준 GeoJSON 을 그대로 폴리곤으로 그린다. 발효 중인
 *   특보 판정은 전부 ai-service(`app/domain/warn_region.py`)가 끝내 놓은 값이다.
 * - **특보가 없는 시군구는 아예 그리지 않는다.** GDD 지도(SigunguGddMap)와 달리
 *   대부분의 날엔 전국이 "특보 없음"이라, 그 상태까지 매번 색칠하면 정작 봐야 할
 *   경고가 묻힌다 — `color` 가 없는 feature 는 건너뛴다.
 * - 시군구와 특보구역 단위가 안 맞는 곳(서울 25개 구 등)은 상위 특보구역으로
 *   근사 매칭했다(`pipeline/region/map_sigungu_to_warn_region.py`) — 중요도가
 *   낮은 기능이라 이 정도 근사치로 간다(V1-39 결정).
 * ---------------------------------------------
 */

const MAP_CONTAINER_ID = "sigungu-warn-map-canvas";

const NATIONWIDE_LEVEL = 13;
const NATIONWIDE_CENTER = { lat: 36.4, lng: 127.9 };

const WARNING_COLOR = "#dc2626";

type Feature = SigunguWarnFeatureCollection["features"][number];

/** Polygon/MultiPolygon 의 외곽 고리들만 뽑는다(구멍 무시) — SigunguGddMap 과 동일 규칙. */
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

export function SigunguWarnMap() {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [data, setData] = useState<SigunguWarnFeatureCollection | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<SelectedRegion | null>(null);

  useEffect(() => {
    fetch("/api/map/sigungu-warn")
      .then((res) => res.json())
      .then((json: SigunguWarnFeatureCollection | { error: string }) => {
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
      if (!feature.properties.color) continue;

      const path = outerRings(feature.geometry).map((ring) =>
        ring.map(([lng, lat]) => new sdk.maps.LatLng(lat, lng)),
      );

      const polygon = new sdk.maps.Polygon({
        path,
        fillColor: feature.properties.color,
        fillOpacity: 0.5,
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
        기상특보 지도를 불러오지 못했습니다. ai-service 연결(AI_SERVICE_URL/AI_SERVICE_TOKEN)을
        확인해 주세요.
      </p>
    );
  }

  const hasWarning = data?.features.some((f) => f.properties.color) ?? true;

  return (
    <div className="flex flex-col gap-3">
      <KakaoSdkScript onStatusChange={setStatus} />
      <div
        className="h-[24rem] w-full overflow-hidden rounded-lg border border-border sm:h-[28rem]"
        id={MAP_CONTAINER_ID}
      />
      <Legend />
      {data && !hasWarning && (
        <p className="text-fg-muted text-sm">
          현재 발효 중인 기상특보가 없습니다.
        </p>
      )}
      {selected && <RegionInfo region={selected} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-fg-muted text-xs">
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 rounded-sm"
          style={{ backgroundColor: WARNING_COLOR }}
        />
        발효 중인 특보
      </span>
    </div>
  );
}

function RegionInfo({ region }: { region: SelectedRegion }) {
  const { properties } = region;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="font-medium text-fg">{region.name}</p>
      <p className="text-fg-muted">{properties.label}</p>
    </div>
  );
}
