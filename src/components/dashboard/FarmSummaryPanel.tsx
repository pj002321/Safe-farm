import { Card } from "@/components/shared/Card";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
import { aiService } from "@/shared/aiService/client";

export function FarmSummaryFallback() {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <SatelliteScan compact labelKo="밭 전체 상태를 요약하는 중" />
    </div>
  );
}

/** 밭이 없거나 근거를 못 만들면 조용히 아무것도 그리지 않는다 — 아래 밭별
 * 리포트가 그 경우의 안내 문구를 이미 담당한다. */
export async function FarmSummaryPanel({ userId }: { userId: string }) {
  const result = await aiService.farmSummary(userId);
  if (!result.ok || !result.data.available) return null;

  return (
    <Card padding="md" title={`밭 전체 요약 · ${result.data.plotCount}곳`}>
      <p className="text-[0.9rem] text-fg leading-relaxed">
        {result.data.summary}
      </p>
    </Card>
  );
}
