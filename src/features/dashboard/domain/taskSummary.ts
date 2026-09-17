/**
 * ---------------------------------------------
 * [Feature]: 오늘 할 일 카드 요약 (순수 변환)
 *
 * [Description]
 * - DB 행 → 화면이 쓰는 모양으로 좁히기만 한다. `plotSummary.ts`/`toPlotCard` 와
 *   같은 나눔이다. 실제 조회는 `taskStore.ts` 가 한다.
 * - `Priority`/`TaskCardData` 는 원래 `components/dashboard/sample.ts` 에 있었다.
 *   조회가 붙으면서 그 파일의 주석대로("계산이 생기면 features/<도메인>/domain 으로")
 *   여기로 옮기고, sample.ts 는 이 타입을 다시 가져다 쓴다.
 * ---------------------------------------------
 */

export type Priority = "high" | "mid" | "low";

export interface TaskCardData {
  id: string;
  /** 어느 밭의 일인가. 홈이 밭별로 묶고, 밭 상세로 링크하는 데 쓴다. */
  plotId: string;
  titleKo: string;
  /** 왜 이 작업이 나왔는가. 스펙상 **근거 없는 작업은 카드로 만들지 않는다.** */
  reasonKo: string;
  priority: Priority;
  plotKo: string;
  /** 근거가 된 재배매뉴얼 원문. 없으면 링크를 그리지 않는다. */
  sourceKo?: string;
  done?: boolean;
  /** 완료 시각. 완료 카드에만 있다. */
  doneAtKo?: string;
  /**
   * 생성 후 며칠 지났는가(KST 날짜 차이). 0 이면 오늘 생긴 카드다.
   *
   * 화면이 "2일째" 배지를 그리는 근거다. 어제 만들어졌는데 아직 미완료인 카드는
   * **오늘 다시 만들어지지 않는다** — 생성 쪽이 같은 제목의 미완료 카드가 있으면
   * 건너뛰기 때문이다(ai-service plot_tasks.generate_tasks_for_plot). 그래서
   * "오늘 생성분"만 거르면 아직 해야 하는 일이 화면에서 사라진다.
   */
  daysOpen: number;
  /**
   * 안 하고 넘어간 카드인가.
   *
   * 배치가 닫은 것이다(ai-service `expire_stale_tasks`). 닫아야 같은 제목의 새
   * 카드가 다시 나온다 — 열어 둔 채로 홈에서만 내리면 생성이 영영 막힌다.
   * 이력 화면이 "안 함"으로 표시한다.
   */
  expired: boolean;
}

/** plot_tasks 한 행 + 조인한 plots.name. */
export interface TaskRow {
  id: string;
  plot_id: string;
  title: string;
  reason: string;
  priority: string;
  done: boolean;
  done_at: string | null;
  expired_at: string | null;
  generated_at: string;
  plots: { name: string | null } | null;
}

/** 급한 순서. 화면 정렬에 쓴다("우선순위순") — DB 에는 이 순서가 없다. */
const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

/**
 * 홈에 이월해 보여 줄 미완료 카드의 최대 일수.
 *
 * 이보다 오래된 미완료 카드는 이전 기록으로 넘긴다. 무한정 쌓이면 정작 오늘 할
 * 일이 아래로 밀리고, 그러면 목록 자체를 안 보게 된다.
 */
export const CARRY_OVER_DAYS = 3;
// ⚠️ ai-service 의 EXPIRE_AFTER_DAYS 와 **같은 값이어야 한다**
//    (app/service/plot_tasks.py). 두 언어라 타입으로 묶을 수 없어 양쪽에 테스트를
//    두고 값을 박아 뒀다. 어긋나면 화면에서 사라진 카드가 생성을 계속 막거나,
//    화면에 남아 있는 카드 옆에 같은 제목이 하나 더 뜬다.

/**
 * KST 기준 시각 계산.
 *
 * 서버가 UTC 로 돌든 로컬로 돌든 같은 답이 나와야 하므로, 런타임 타임존에
 * 의존하는 `getFullYear()` 류를 쓰지 않고 고정 오프셋으로 민다.
 * **한국은 서머타임이 없어** 오프셋이 항상 +9 다 — 이 단순화가 성립하는 이유다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 그 시각이 속한 KST 달력일의 일련번호. 날짜만 비교할 때 쓴다. */
function kstDayNumber(at: Date): number {
  return Math.floor((at.getTime() + KST_OFFSET_MS) / 86_400_000);
}

/**
 * `now` 가 속한 KST 날짜의 00:00 에 해당하는 실제 시각.
 *
 * ⚠️ `now` 를 그대로 자르면 안 된다. KST 00:30 은 UTC 로는 **전날** 15:30 이라,
 *    UTC 기준으로 자르면 하루가 어긋난다.
 */
export function kstDayStart(now: Date): Date {
  return new Date(kstDayNumber(now) * 86_400_000 - KST_OFFSET_MS);
}

/**
 * 홈이 보여 줄 미완료 카드의 시작 경계. 오늘 00:00 KST 에서 CARRY_OVER_DAYS 만큼
 * 거슬러 올라간 시각이다.
 */
export function carryOverStart(now: Date): Date {
  return new Date(kstDayStart(now).getTime() - CARRY_OVER_DAYS * 86_400_000);
}

/** 생성 시각과 현재의 KST 날짜 차이. 같은 날이면 0. */
export function daysOpenOf(generatedAt: Date, now: Date): number {
  return kstDayNumber(now) - kstDayNumber(generatedAt);
}

export function toTaskCard(row: TaskRow, now: Date): TaskCardData {
  return {
    id: row.id,
    plotId: row.plot_id,
    titleKo: row.title,
    reasonKo: row.reason,
    // priority 는 DB check 제약(priority in ('high','mid','low'))이 값을 보증한다.
    priority: row.priority as Priority,
    plotKo: row.plots?.name ?? "이름 없는 밭",
    done: row.done,
    doneAtKo: row.done_at ? formatDoneAt(row.done_at) : undefined,
    daysOpen: daysOpenOf(new Date(row.generated_at), now),
    expired: row.expired_at !== null,
  };
}

function formatDoneAt(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function sortByPriority(cards: readonly TaskCardData[]): TaskCardData[] {
  return [...cards].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}
