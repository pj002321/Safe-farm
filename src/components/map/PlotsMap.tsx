"use client";

import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SproutIcon } from "@/components/icons";
import { CROPS } from "@/components/plot/CropChips";
import {
  daysSincePlanting,
  type PlotMapPoint,
} from "@/features/plots/domain/plotSummary";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";

/**
 * ---------------------------------------------
 * [Feature]: 지도 탭 — 등록 텃밭 초기 뷰 (V1-34)
 *
 * [Description]
 * - 마커는 아직 없다(V1-35 몫). "카메라가 올바른 위치·배율로 시작하는가"만 책임진다.
 * - 텃밭이 하나면 그 점 중심으로 고정 줌(스펙), 여럿이면 bounds 로 전부 담는다.
 * ---------------------------------------------
 */

const FARM_MAP_CONTAINER_ID = "farm-map-canvas";

/** 텃밭이 하나뿐일 때 줌 레벨. 마을 단위가 보이는 값. */
const SINGLE_PLOT_LEVEL = 4;

interface PlotsMapProps {
  points: readonly PlotMapPoint[];
}

/** 작물 아이콘 + D+n 글자를 지도 위 말풍선 HTML로 굳힌다. */
function markerHtml(point: PlotMapPoint, now: Date): string {
  const crop = CROPS.find((c) => c.id === point.cropId);
  const days = daysSincePlanting(point, now);

  return renderToStaticMarkup(
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-accent shadow-sm">
      {crop?.icon ?? <SproutIcon />}
      {days !== null && (
        <span className="text-fg text-xs font-medium">D+{days}</span>
      )}
    </div>,
  );
}

export function PlotsMap({ points }: PlotsMapProps) {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");

  useEffect(() => {
    if (status !== "ready" || points.length === 0) return;

    const container = document.getElementById(FARM_MAP_CONTAINER_ID);
    const sdk = window.kakao;
    if (!container || !sdk) return;

    const first = points[0];
    const map = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(first.latitude, first.longitude),
      level: SINGLE_PLOT_LEVEL,
    });

    if (points.length > 1) {
      const bounds = new sdk.maps.LatLngBounds();
      for (const point of points) {
        bounds.extend(new sdk.maps.LatLng(point.latitude, point.longitude));
      }
      map.setBounds(bounds);
    }

    const now = new Date();
    for (const point of points) {
      const overlay = new sdk.maps.CustomOverlay({
        position: new sdk.maps.LatLng(point.latitude, point.longitude),
        content: markerHtml(point, now),
        yAnchor: 1,
      });
      overlay.setMap(map);
    }
  }, [status, points]);

  return (
    <>
      <KakaoSdkScript onStatusChange={setStatus} />
      <div
        className="h-[24rem] w-full overflow-hidden rounded-lg border border-border sm:h-[28rem]"
        id={FARM_MAP_CONTAINER_ID}
      />
    </>
  );
}