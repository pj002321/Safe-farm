/**
 * ---------------------------------------------
 * [Feature]: 화면이 보여 줄 밭 고르기 (순수 함수)
 *
 * [Description]
 * - `?plot=` 로 들어온 id 를 내 밭 목록에서 확인해 고른다. 목록에 없으면
 *   (지운 밭·남의 밭·오타) **조용히 가장 최근 밭으로 돌아간다.** 쿼리 문자열은
 *   사용자가 고칠 수 있는 값이라 그걸로 화면을 죽이면 안 된다.
 * - 홈에서 이 규칙을 **두 곳이 쓴다** — 특보 배너와 예보 칸이다. 각자 고르게
 *   두면 어느 날 한쪽만 바뀌어 "배너는 A밭, 예보는 B밭"이 된다. 그래서 규칙을
 *   여기 한 곳에 둔다.
 *
 * [Usage]
 * ```ts
 * const selected = selectPlot(plots, requestedPlotId);
 * if (!selected) return null; // 밭이 하나도 없다
 * ```
 * ---------------------------------------------
 */

/** 고르기에 필요한 최소 모양. `listPlots` 의 행이 이걸 만족한다. */
export interface SelectablePlot {
  id: string;
}

/**
 * 고른 밭. 목록이 비어 있으면 `null`.
 *
 * 기본값이 `plots[0]` 인 것은 `listPlots` 가 `created_at` 내림차순이기 때문이다
 * — 방금 등록한 밭을 홈에서 바로 보게 된다.
 */
export function selectPlot<T extends SelectablePlot>(
  plots: readonly T[],
  requestedPlotId?: string,
): T | null {
  if (plots.length === 0) return null;
  return plots.find((plot) => plot.id === requestedPlotId) ?? plots[0];
}
