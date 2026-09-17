import { AlertTriangleIcon, SatelliteIcon } from "@/components/icons";
import type { HazardAlert } from "@/features/dashboard/domain/hazardAlert";

/**
 * ---------------------------------------------
 * [Feature]: 최상단 알림 배너 · 데이터 신선도 (마크업 전용)
 *
 * [Description]
 * - 기상 특보는 **최상단 고정**이다(스펙). 화면에서 가장 먼저 읽혀야 하는 정보라
 *   다른 카드와 같은 흐름에 섞지 않는다.
 * - **토스트로 만들지 않았다.** 자리를 덜 먹는 건 맞지만 토스트는 스스로 사라진다.
 *   서리·한파 특보는 놓치면 작물이 죽는 정보라, 사용자가 잠깐 자리를 비운 사이
 *   지워지는 자리에 둘 수 없다. 대신 **닫을 수 있게** 했다 — 읽고 닫으면
 *   화면을 가리지 않고, 사라지는 시점을 사람이 정한다.
 *   닫아도 대응 작업 카드는 할 일 목록에 남으므로 내용이 유실되지 않는다.
 *   닫기는 숨긴 체크박스 + `has-[:checked]:hidden` 이라 JS 가 필요 없다.
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
    // 한 줄로 눕힌다. 제목과 본문을 세로로 쌓으면 화면 맨 위를 두 줄이 먹어
    // 정작 봐야 할 할 일이 접힌 곳 아래로 밀린다. 좁은 화면에서만 줄바꿈된다.
    <div
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-4 py-2.5 has-[:checked]:hidden ${
        isSevere
          ? "border-unsuitable/30 bg-unsuitable/10"
          : "border-caution/30 bg-caution/10"
      }`}
    >
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 font-semibold text-[0.88rem] ${
          isSevere ? "text-unsuitable" : "text-caution"
        }`}
      >
        <AlertTriangleIcon className="size-4" />
        {alert.kindKo}
      </span>
      <span className="min-w-0 flex-1 text-[0.82rem] text-fg-muted leading-relaxed">
        {alert.bodyKo}
      </span>

      {/* 닫기. 체크되면 바깥 div 가 통째로 숨는다(입력은 숨은 채로 상태를 유지). */}
      <label
        className={`-mr-1 ml-auto shrink-0 cursor-pointer rounded-full px-1.5 py-0.5 text-lg leading-none transition-colors ${
          isSevere
            ? "text-unsuitable/70 hover:bg-unsuitable/10 hover:text-unsuitable"
            : "text-caution/70 hover:bg-caution/10 hover:text-caution"
        }`}
      >
        <span className="sr-only">특보 안내 닫기</span>
        <input className="peer sr-only" type="checkbox" />
        <span aria-hidden="true">×</span>
      </label>
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
    // 테두리 없이 옅은 면으로만. 특보와 같은 무게로 그리면 둘 다 흘려보게 된다.
    <p className="flex items-start gap-2 rounded-md bg-info/10 px-3.5 py-2 text-[0.8rem] text-fg-muted leading-relaxed">
      <SatelliteIcon className="mt-0.5 size-4 shrink-0 text-info" />
      {deviationKo}
    </p>
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
