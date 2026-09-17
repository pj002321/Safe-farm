"use client";

import { useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SproutIcon } from "@/components/icons";
import {
  findCalendarByNameKo,
  stageAt,
} from "@/features/growth/domain/growthStage";
import {
  daysSincePlanting,
  type PlotMapPoint,
} from "@/features/plots/domain/plotSummary";

/**
 * ---------------------------------------------
 * [Feature]: 내 밭 마커 — 지도 위 새싹 핀과 요약 카드
 *
 * [Description]
 * - `PlotsMap` 에 있던 마커 그리기를 훅으로 꺼냈다. 지도 인스턴스가 하나로
 *   합쳐지면서(`MapWorkspace`) 마커와 시군구 색칠이 **같은 지도**에 얹히기
 *   때문이다. 예전엔 지도 두 개가 세로로 쌓여 있었다.
 * - 마커를 누르면 밭 이름·작물·생육단계·다음 작업 요약 카드가 열린다(V1-36).
 *   생육단계는 `CROP_CALENDARS` 에 없는 작물(단감 등 과수)이면 생략한다.
 * - 오버레이를 **정리한다.** 예전에는 지도를 통째로 다시 만들어 치웠는데, 지도가
 *   한 번만 만들어지는 지금은 직접 떼지 않으면 밭 목록이 바뀔 때 옛 핀이 남는다.
 *
 * [Usage]
 * ```tsx
 * usePlotMarkers(map, points);
 * ```
 * ---------------------------------------------
 */

/** 새싹 아이콘 + D+n 을 그리고, 클릭하면 요약 카드를 여닫는 실제 DOM 마커를 만든다. */
function markerElement(point: PlotMapPoint, now: Date): HTMLDivElement {
  const days = daysSincePlanting(point, now);

  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = renderToStaticMarkup(
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-accent shadow-sm">
      <SproutIcon />
      {days !== null && (
        <span className="font-medium text-fg text-xs">D+{days}</span>
      )}
    </div>,
  );
  return el;
}

/** 마커를 눌렀을 때 뜨는 밭 이름·작물·생육단계·다음 작업 요약 카드. */
function summaryHtml(point: PlotMapPoint, now: Date): string {
  const calendar = findCalendarByNameKo(point.cropNameKo);
  const days = daysSincePlanting(point, now);
  // 달력이 없는 작물은 생육단계를 못 낸다 — 별도 계산식이 필요하다(과수 등).
  const stage = calendar && days !== null ? stageAt(calendar, days) : null;

  return renderToStaticMarkup(
    <div className="max-w-56 whitespace-normal rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-fg">{point.nameKo ?? "이름 없는 밭"}</p>
      <p className="text-fg-muted">{point.cropNameKo ?? "작물 미정"}</p>
      {stage && (
        <>
          <p className="mt-1.5 font-medium text-accent text-xs">
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

export function usePlotMarkers(
  map: kakao.maps.Map | null,
  points: readonly PlotMapPoint[],
): void {
  useEffect(() => {
    const sdk = window.kakao;
    if (!map || !sdk || points.length === 0) return;

    const overlays: kakao.maps.CustomOverlay[] = [];
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

      const pin = new sdk.maps.CustomOverlay({
        position,
        content: marker,
        yAnchor: 1,
      });
      pin.setMap(map);
      overlays.push(pin, summary);
    }

    return () => {
      for (const overlay of overlays) overlay.setMap(null);
    };
  }, [map, points]);
}
