import { failureReasonKo } from "@/features/cultivations/domain/failureReason";
import type { HarvestSummary } from "@/features/cultivations/domain/harvestSummary";

/**
 * ---------------------------------------------
 * [Feature]: 끝난 재배의 요약
 *
 * [Description]
 * - 며칠 걸렸고 총 GDD 가 얼마였는지. 다음 시즌에 같은 작물을 심을 때 쓰는 값이다.
 * - **예측 오차를 숨기지 않는다.** 며칠 빗나갔는지 보여야 다음 예측을 믿을지
 *   사용자가 정한다. 중단한 건은 예측 대상이 아니었으므로 오차를 내지 않는다.
 * - 관측이 빠진 날이 있으면 총 GDD 가 실제보다 낮다. 그 사실을 한 줄로 적는다 —
 *   숫자만 보여 주면 관측 공백이 작물 탓으로 읽힌다.
 * ---------------------------------------------
 */

export interface HarvestSummaryCardProps {
  summary: HarvestSummary;
  /** 중단 사유 코드. 수확한 건이면 null. */
  failureReason: string | null;
}

/** 값 한 칸. `Stat` 은 숫자만 받는데 여기는 "모름"·"3일 빠름" 같은 문장도 낸다. */
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <p className="text-fg-muted text-xs">{label}</p>
      <p className="font-semibold text-fg">{value}</p>
    </div>
  );
}

/** 오차를 사람 말로. 음수는 예측보다 일찍 끝났다는 뜻이다. */
function errorKo(days: number): string {
  if (days === 0) return "예측과 같은 날";
  return days < 0 ? `예측보다 ${-days}일 빠름` : `예측보다 ${days}일 늦음`;
}

export function HarvestSummaryCard({
  summary,
  failureReason,
}: HarvestSummaryCardProps) {
  const missing =
    summary.totalDays === null
      ? 0
      : Math.max(0, summary.totalDays - summary.coveredDays);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-muted text-sm">
        {summary.ended === "HARVESTED"
          ? `${summary.endedOn} 수확했습니다.`
          : `${summary.endedOn} 중단했습니다 — ${failureReasonKo(failureReason)}.`}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Cell
          label="걸린 날"
          value={summary.totalDays === null ? "모름" : `${summary.totalDays}일`}
        />
        <Cell label="총 적산온도" value={`${summary.totalGdd}℃·일`} />
        {summary.forecastErrorDays !== null && (
          <Cell label="예측 오차" value={errorKo(summary.forecastErrorDays)} />
        )}
      </div>

      {missing > 0 && (
        <p className="text-fg-muted text-xs">
          관측이 {missing}일 비어 총 적산온도가 실제보다 낮습니다.
        </p>
      )}
    </div>
  );
}
