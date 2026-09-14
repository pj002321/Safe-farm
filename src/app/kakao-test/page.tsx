"use client";

import { useState } from "react";
import { PlotLocationPicker } from "@/components/monitoring/PlotLocationPicker";
import type { LatLon } from "@/features/monitoring/domain/geo";

/** ⚠️ 임시 확인용 페이지. 지도 부품을 프론트에 넘기기 전에 삭제한다. */
export default function KakaoTestPage() {
  const [coord, setCoord] = useState<LatLon | null>(null);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 font-semibold text-fg text-xl">지도 확인용</h1>

      <PlotLocationPicker value={coord} onChange={setCoord} />

      <p className="mt-4 font-mono text-fg-muted text-sm tabular-nums">
        {coord
          ? `lat ${coord.lat.toFixed(6)} · lon ${coord.lon.toFixed(6)}`
          : "지도를 클릭해 위치를 찍어보세요"}
      </p>
    </main>
  );
}
