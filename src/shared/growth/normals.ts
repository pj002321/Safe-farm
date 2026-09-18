import type { MonthlyNormal } from "./forecast";

/**
 * ---------------------------------------------
 * [Feature]: 관측소 일별 평년값 → 월별 평년값 (순수 함수)
 *
 * [Description]
 * - `normals` 표는 관측소 × (월, 일) 로 366행씩이다. `forecastArrival_2` 는 그중
 *   **달마다 한 값**(`MonthlyNormal`)만 받는다 — 예보 밖 날짜를 "그 달의 평년 기온"
 *   으로 메운다. 여기서 일별을 달로 접는다.
 * - 왜 이 접기가 필요했나: 시금치를 9월 1일에 심은 밭이 "수확 10월 23일" 로 떴다.
 *   최근 7일 평균(9월, 하루 17 GDD)이 계속된다고 본 것인데, 실제 평년으로 하루씩
 *   쌓으면 10월 11 · 11월 5 · 12월 1 로 떨어져 **11월 19일**이다. 4주 차이다.
 *   `_2` 가 그 계산을 하는데, 넘겨줄 월별 값이 없어 `_1` 만 돌고 있었다(2026-09-18).
 * - **source 는 하나만 쓴다.** 같은 관측소에 `kma`(1991~2020)와 `kma-1981`(1981~2010)
 *   이 같이 있는 곳이 70곳이다. 섞어 평균내면 두 기준이 반씩 들어간 값이 된다.
 *   앞엣것이 이긴다 — ai-service `gdd_region.NORMAL_PRIORITY` 와 같은 차례다.
 *
 * [Usage]
 * ```ts
 * toMonthlyNormals(rows)            // rows: normals 표에서 관측소 하나를 읽은 것
 * // → [{ month: 1, tempMaxC: 3.2, tempMinC: -5.1 }, …]  달 차례, 있는 달만
 * ```
 * ---------------------------------------------
 */

/** `normals` 한 행. 관측소는 호출자가 이미 골라 넘긴다. */
export interface NormalRow {
  source: string;
  month: number;
  tempMaxC: number | null;
  tempMinC: number | null;
}

/** 앞엣것이 이긴다. 새 기준(1991~2020)이 기본이고, 없을 때만 옛 기준으로 내려간다. */
export const NORMAL_SOURCE_PRIORITY: readonly string[] = ["kma", "kma-1981"];

export function toMonthlyNormals(
  rows: readonly NormalRow[],
  priority: readonly string[] = NORMAL_SOURCE_PRIORITY,
): MonthlyNormal[] {
  const source = priority.find((s) => rows.some((r) => r.source === s));
  if (source === undefined) return [];

  const sums = new Map<number, { max: number; min: number; n: number }>();
  for (const r of rows) {
    if (r.source !== source) continue;
    if (r.tempMaxC === null || r.tempMinC === null) continue; // 결측일은 평균에서 뺀다
    if (!Number.isInteger(r.month) || r.month < 1 || r.month > 12) continue;
    const acc = sums.get(r.month) ?? { max: 0, min: 0, n: 0 };
    acc.max += r.tempMaxC;
    acc.min += r.tempMinC;
    acc.n += 1;
    sums.set(r.month, acc);
  }

  return [...sums.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, { max, min, n }]) => ({
      month,
      tempMaxC: max / n,
      tempMinC: min / n,
    }));
}
