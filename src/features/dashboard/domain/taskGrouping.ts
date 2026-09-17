/**
 * ---------------------------------------------
 * [Feature]: 할 일 카드를 밭별로 묶기 (순수 함수)
 *
 * [Description]
 * - 홈이 카드를 한 줄로 늘어놓지 않고 **밭별 섹션**으로 보여 준다. 밭이 둘 이상이면
 *   "이 물 주기가 어느 밭 얘기지"를 카드마다 읽어야 했고, 밭 이름이 카드 안에
 *   작게 들어가 있어 눈에 잘 안 들어왔다.
 * - **밭 정렬은 급한 순서다.** 가장 급한 카드를 가진 밭이 위로 온다. 밭 등록순으로
 *   두면 오늘 급한 밭이 스크롤 아래에 숨는다.
 * - **할 일이 없는 밭도 자리를 남긴다.** 다만 카드 없이 한 줄로 축약한다 —
 *   빈 카드를 밭 수만큼 그리면 화면을 통째로 먹는다.
 *
 * [Usage]
 * ```ts
 * const groups = groupTasksByPlot(tasks, plots);
 * // → [{ plotId, plotKo, open: [...], done: [...] }, ...]
 * ```
 * ---------------------------------------------
 */

import {
  type Priority,
  sortByPriority,
  type TaskCardData,
} from "./taskSummary";

/** 밭 하나와 그 밭에 걸린 오늘의 카드들. */
export interface PlotTaskGroup {
  plotId: string;
  plotKo: string;
  /** 아직 안 한 일. 급한 순서. */
  open: TaskCardData[];
  /** 오늘 끝낸 일. 완료 순서(최근이 아래). */
  done: TaskCardData[];
}

/** 묶기에 필요한 최소 모양. `PlotCard` 가 이걸 만족한다. */
export interface GroupablePlot {
  id: string;
  nameKo: string | null;
}

/** 수확 여부 판단에 필요한 최소 모양. `PlotCard` 가 이걸 만족한다. */
export interface HarvestablePlot {
  id: string;
  cultivations: readonly { status: string }[];
}

/** 밭 정렬에 쓰는 급함 점수. 낮을수록 위로 온다. */
const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

/** 할 일이 없는 밭은 있는 밭보다 항상 아래. */
const NO_OPEN_TASK_RANK = 99;

function urgencyOf(group: PlotTaskGroup): number {
  if (group.open.length === 0) return NO_OPEN_TASK_RANK;
  // open 은 이미 급한 순으로 정렬돼 있으므로 첫 장이 그 밭의 급함이다.
  return PRIORITY_RANK[group.open[0].priority];
}

/**
 * 카드를 밭별로 묶는다.
 *
 * `plots` 를 함께 받는 이유: 카드가 하나도 없는 밭도 화면에 나와야 한다. 카드만
 * 보고 묶으면 그런 밭이 통째로 사라져, 사용자는 밭을 빠뜨린 줄 안다.
 *
 * 밭 목록에 없는 카드는 버린다 — 방금 지운 밭의 카드가 그렇다. 카드가 화면에
 * 남아 있어 봐야 누를 곳이 없다.
 */
export function groupTasksByPlot(
  tasks: readonly TaskCardData[],
  plots: readonly GroupablePlot[],
): PlotTaskGroup[] {
  const groups = new Map<string, PlotTaskGroup>(
    plots.map((plot) => [
      plot.id,
      {
        plotId: plot.id,
        plotKo: plot.nameKo?.trim() || "이름 없는 밭",
        open: [],
        done: [],
      },
    ]),
  );

  for (const task of tasks) {
    const group = groups.get(task.plotId);
    if (!group) continue;
    (task.done ? group.done : group.open).push(task);
  }

  for (const group of groups.values()) {
    group.open = sortByPriority(group.open);
  }

  // 급한 밭 먼저. 같은 급함이면 밭 목록 순서(= 최근 등록순)를 유지해야 하므로
  // 안정 정렬이 필요하다 — Array.prototype.sort 는 ES2019부터 안정 정렬이다.
  return [...groups.values()].sort((a, b) => urgencyOf(a) - urgencyOf(b));
}

/**
 * 아직 수확이 끝나지 않은 밭의 id.
 *
 * 이력 화면이 이걸로 거른다 — **기록은 수확 전까지만 보여 준다.** 수확이 끝나면
 * 그 밭의 한 철이 끝난 것이라, 다음 작물의 기록과 섞이면 "올해 뭘 했나"를 읽을 수
 * 없게 된다.
 *
 * ⚠️ **지우는 것이 아니라 감추는 것이다.** 행은 DB 에 그대로 남는다 — 수확 뒤에
 *    작황을 되짚어야 할 때 필요하고, 한번 지우면 되돌릴 수 없다.
 *
 * 재배가 하나도 없는 밭은 "아직 심지 않은 밭"이라 살아 있는 것으로 본다.
 */
export function activePlotIds(
  plots: readonly HarvestablePlot[],
): ReadonlySet<string> {
  return new Set(
    plots
      .filter(
        (plot) =>
          plot.cultivations.length === 0 ||
          plot.cultivations.some((c) => c.status !== "HARVESTED"),
      )
      .map((plot) => plot.id),
  );
}

/** 화면 맨 위 요약에 쓰는 전체 미완료 건수. */
export function totalOpenCount(groups: readonly PlotTaskGroup[]): number {
  return groups.reduce((sum, group) => sum + group.open.length, 0);
}
