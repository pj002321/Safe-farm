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
}

/** plot_tasks 한 행 + 조인한 plots.name. */
export interface TaskRow {
  id: string;
  title: string;
  reason: string;
  priority: string;
  done: boolean;
  done_at: string | null;
  plots: { name: string | null } | null;
}

/** 급한 순서. 화면 정렬에 쓴다("우선순위순") — DB 에는 이 순서가 없다. */
const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

export function toTaskCard(row: TaskRow): TaskCardData {
  return {
    id: row.id,
    titleKo: row.title,
    reasonKo: row.reason,
    // priority 는 DB check 제약(priority in ('high','mid','low'))이 값을 보증한다.
    priority: row.priority as Priority,
    plotKo: row.plots?.name ?? "이름 없는 밭",
    done: row.done,
    doneAtKo: row.done_at ? formatDoneAt(row.done_at) : undefined,
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
