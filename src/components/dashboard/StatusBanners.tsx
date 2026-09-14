import { AlertTriangleIcon, SatelliteIcon } from "@/components/icons";
import type { HazardAlert } from "./sample";

/**
 * ---------------------------------------------
 * [Feature]: 최상단 알림 배너 · 데이터 신선도 (마크업 전용)
 *
 * [Description]
 * - 기상 특보는 **최상단 고정**이다(스펙). 화면에서 가장 먼저 읽혀야 하는 정보라
 *   다른 카드와 같은 흐름에 섞지 않는다.
 * - 지역 생육 편차는 **조건부**다. 위성 위상차가 5일 이상일 때만 나오고 상시
 *   노출은 금지다 — 늘 떠 있는 경고는 곧 아무도 안 읽는 경고가 된다.
 *   그래서 `deviationKo` 가 없으면 아예 렌더하지 않는다.
 * - 데이터 신선도는 **갱신에 실패하면 문구가 경고로 바뀐다**(스펙). 기준 시각만
 *   조용히 옛날 값으로 두면 사용자는 오늘 데이터라고 믿는다.
 * - 배너에 `role="alert"` 를 쓰지 않았다. 페이지와 함께 처음부터 있는 내용이라
 *   alert 로 두면 스크린리더가 페이지 진입 때마다 본문을 가로채 읽는다.
 *   특보가 **도중에** 끼어드는 동작이 붙으면 그때 live region 으로 바꾼다.
 *
 * [Usage]
 * ```tsx
 * <HazardBanner alert={SAMPLE_ALERT} />
 * <DeviationBanner deviationKo="배추밭이 인근 평균보다 6일 늦습니다" />
 * <DataFreshness baseKo="2026-09-14 06:00" sourceKo="기상청 …" stale={false} />
 * ```
 * ---------------------------------------------
 */

export function HazardBanner({ alert }: { alert: HazardAlert | null }) {
  if (!alert) return null;

  const isSevere = alert.tone === "unsuitable";

  return (
    <div
      className={`flex gap-3 rounded-lg border px-4 py-3.5 ${
        isSevere
          ? "border-unsuitable/30 bg-unsuitable/10"
          : "border-caution/30 bg-caution/10"
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 ${isSevere ? "text-unsuitable" : "text-caution"}`}
      >
        <AlertTriangleIcon />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-[0.95rem] text-fg">{alert.kindKo}</p>
        <p className="mt-1 text-[0.86rem] text-fg-muted leading-relaxed">
          {alert.bodyKo}
        </p>
      </div>
    </div>
  );
}

/** 위성 위상차가 길게 벌어졌을 때만. 상시 노출 금지(스펙). */
export function DeviationBanner({
  deviationKo,
}: {
  deviationKo: string | null;
}) {
  if (!deviationKo) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-3">
      <span className="shrink-0 text-info">
        <SatelliteIcon />
      </span>
      <p className="text-[0.86rem] text-fg leading-relaxed">{deviationKo}</p>
    </div>
  );
}

interface DataFreshnessProps {
  baseKo: string;
  sourceKo: string;
  /** 갱신에 실패해 이전 데이터를 쓰고 있는가. */
  stale: boolean;
}

export function DataFreshness({ baseKo, sourceKo, stale }: DataFreshnessProps) {
  return (
    <p
      className={`inline-flex flex-wrap items-center gap-x-2 font-mono text-[0.68rem] ${
        stale ? "text-caution" : "text-fg-subtle"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${stale ? "bg-caution" : "bg-telemetry"}`}
      />
      {stale ? "갱신 실패 · 이전 데이터" : "기준"} {baseKo}
      <span className="text-fg-subtle">· {sourceKo}</span>
    </p>
  );
}
