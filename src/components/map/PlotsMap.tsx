"use client";

import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SproutIcon } from "@/components/icons";
import { CROPS } from "@/components/plot/CropChips";
import { CROP_CALENDARS, stageAt } from "@/features/growth/domain/growthStage";
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
 * [Feature]: 지도 탭 — 등록 텃밭 초기 뷰 + 마커 (V1-34~36)
 *
 * [Description]
 * - 텃밭이 하나면 그 점 중심으로 고정 줌(스펙), 여럿이면 bounds 로 전부 담는다.
 * - 마커는 작물 아이콘 + D+n 라벨을 얹은 CustomOverlay다(V1-35).
 * - 마커를 누르면 밭 이름·작물·생육단계·다음 작업·상세 링크 요약 카드가 토글된다(V1-36).
 *   생육단계는 `CROP_CALENDARS`(features/growth)에 없는 작물(단감 등 과수)이면 생략된다.
 * ---------------------------------------------
 */

const FARM_MAP_CONTAINER_ID = "farm-map-canvas";

/** 텃밭이 하나뿐일 때 줌 레벨. 마을 단위가 보이는 값. */
const SINGLE_PLOT_LEVEL = 4;

interface PlotsMapProps {
  points: readonly PlotMapPoint[];
}

/** 작물 아이콘 + D+n 을 그리고, 클릭하면 요약 카드를 여닫는 실제 DOM 마커를 만든다. */
function markerElement(point: PlotMapPoint, now: Date): HTMLDivElement {
  const crop = CROPS.find((c) => c.id === point.cropId);
  const days = daysSincePlanting(point, now);

  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = renderToStaticMarkup(
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-accent shadow-sm">
      {crop?.icon ?? <SproutIcon />}
      {days !== null && (
        <span className="text-fg text-xs font-medium">D+{days}</span>
      )}
    </div>,
  );
  return el;
}

/** 마커를 눌렀을 때 뜨는 밭 이름·작물·생육단계·다음 작업 요약 카드. */
function summaryHtml(point: PlotMapPoint, now: Date): string {
  const crop = CROPS.find((c) => c.id === point.cropId);
  const calendar = point.cropId ? CROP_CALENDARS[point.cropId] : undefined;
  const days = daysSincePlanting(point, now);
  // persimmon 처럼 CROP_CALENDARS 에 없는 작물은 생육단계를 못 낸다 — 별도 계산식이 필요하다(과수).
  const stage = calendar && days !== null ? stageAt(calendar, days) : null;

  return renderToStaticMarkup(
    <div className="max-w-56 whitespace-normal rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-fg">{point.nameKo ?? "이름 없는 밭"}</p>
      <p className="text-fg-muted">{crop?.labelKo ?? "작물 미정"}</p>
      {stage && (
        <>
          <p className="mt-1.5 text-accent text-xs font-medium">
            {stage.nameKo}
          </p>
          <p className="text-fg-muted text-xs">{stage.adviceKo}</p>
        </>
      )}
      <a
        className="mt-1.5 inline-block text-accent text-xs underline"
        href={`/plots/${point.id}`}
      >
        상세 보기
      </a>
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
      const position = new sdk.maps.LatLng(point.latitude, point.longitude);

      const summary = new sdk.maps.CustomOverlay({
        position,
        content: summaryHtml(point, now),
        yAnchor: 1.3,
      });

      const marker = markerElement(point, now);
      let isOpen = false;
      marker.addEventListener("click", () => {
        isOpen = !isOpen;
        summary.setMap(isOpen ? map : null);
        if (isOpen) map.panTo(position);
      });

      new sdk.maps.CustomOverlay({
        position,
        content: marker,
        yAnchor: 1,
      }).setMap(map);
    }
  }, [status, points]);

  return (
    <>
      <KakaoSdkScript onStatusChange={setStatus} />
      <div
        className="h-[24rem] w-full rounded-lg border border-border sm:h-[28rem]"
        id={FARM_MAP_CONTAINER_ID}
      />
    </>
  );
}
