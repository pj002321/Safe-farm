/**
 * ---------------------------------------------
 * [Feature]: 기상특보 → 홈 배너 (순수 변환)
 *
 * [Description]
 * - ai-service 의 밭 예보 응답에 실려 오는 `alert` 를 배너가 그리는 모양으로
 *   좁힌다. `taskSummary.ts` 와 같은 나눔이다 — 조회는 페이지가 하고, 판단은
 *   여기서 한다.
 * - `HazardAlert` 타입이 `components/dashboard/sample.ts` 에서 여기로 왔다.
 *   그 파일 주석이 예고한 대로다("계산이 생기면 features/<도메인>/domain 으로").
 *   `Priority`/`TaskCardData` 가 먼저 같은 길을 갔다.
 * ---------------------------------------------
 */

import type { ReactNode } from "react";

/** 기상 특보. 없으면 배너를 그리지 않는다. */
export interface HazardAlert {
  id: string;
  kindKo: string;
  bodyKo: string;
  tone: "caution" | "unsuitable";
  icon?: ReactNode;
}

/** ai-service `/v1/weather/plot` 응답의 `alert` 조각. */
export interface PlotAlert {
  /** 발효 중인 특보 종류. 예: ["호우", "강풍"]. 안개·황사는 서버가 이미 뺀다. */
  warnings: string[];
  /** 서버가 만든 표시용 문구. 예: "호우·강풍 특보". */
  label: string | null;
  /** 특보 스냅샷을 받아 둔 시각(ISO). 특보는 이 시각까지의 상태다. */
  asOf: string | null;
}

/**
 * 특보 스냅샷이 이보다 오래되면 배너를 그리지 않는다(시간).
 *
 * 적재는 30분마다 돈다. 그보다 한참 지났다는 건 배치가 멈췄다는 뜻이고, 그때
 * 화면에 남은 값은 **지금 발효 중인 특보가 아니라 옛 스냅샷**이다.
 * 해제된 특보를 띄우는 것보다 안 띄우는 편이 낫다 — 틀린 경보를 반복해서 보면
 * 맞는 경보도 무시하게 된다.
 */
const MAX_SNAPSHOT_AGE_HOURS = 6;

/**
 * 배너에 그릴 특보. 없거나 너무 오래된 스냅샷이면 `null`.
 *
 * ⚠️ tone 은 항상 `caution` 이다. 응답에 **주의보·경보 구분이 없기** 때문이다 —
 *    서버가 넘기는 `warnings` 는 종류 이름("호우")뿐이고 등급(`lvl`)은 조회
 *    단계에서 빠진다(ai-service `warn_region._latest_active_alerts` 가 reg_id 와
 *    wrn 만 select 한다). 등급 없이 색을 나누면 근거 없는 추측이 되므로, 등급이
 *    응답에 실릴 때까지는 한 가지 톤으로 둔다.
 */
export function toHazardAlert(
  alert: PlotAlert | null | undefined,
  plotNameKo: string | null,
  now: Date = new Date(),
): HazardAlert | null {
  if (!alert || alert.warnings.length === 0) return null;

  const asOf = alert.asOf ? new Date(alert.asOf) : null;
  if (!asOf || Number.isNaN(asOf.getTime())) return null;

  const ageHours = (now.getTime() - asOf.getTime()) / 3_600_000;
  if (ageHours > MAX_SNAPSHOT_AGE_HOURS) return null;

  const where = plotNameKo?.trim() || "등록하신 밭";

  return {
    // 종류가 바뀌면 다른 특보다. 배너를 닫아 둔 상태가 새 특보까지 덮지 않게 한다.
    id: `warn-${alert.warnings.join("-")}`,
    kindKo: alert.label?.trim() || `${alert.warnings.join("·")} 특보`,
    bodyKo: `${where} 지역에 발효 중입니다. ${formatAsOf(asOf)} 기준입니다.`,
    tone: "caution",
  };
}

function formatAsOf(at: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}
