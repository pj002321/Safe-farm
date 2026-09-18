import type { MonthlyNormal } from "./forecast";

/**
 * ---------------------------------------------
 * [Feature]: 일별 평년값 → 월별 평년값 접기 (순수)
 *
 * [Description]
 * - `normals` 는 **날짜별**(월·일)로 들어온다. 관측소 하나에 366행이다. 반면
 *   `forecastArrival_2` 가 읽는 `MonthlyNormal` 은 **월 단위**라 그대로 못 쓴다.
 *   그 간극을 메우는 것이 이 파일 전부다.
 * - 월 평균으로 접는다. 도달 예측은 하루씩 90~120일을 쌓는 계산이라 일별 굴곡이
 *   합계에서 거의 상쇄된다. 월 단위로 줄이면 계절 변화는 그대로 따라가면서
 *   행 수가 366 → 12 로 준다.
 * - **관측소를 섞지 않는다.** 두 관측소의 9월을 한 평균으로 뭉개면 어느 밭의
 *   평년값도 아닌 값이 나온다. 부르는 쪽이 관측소 하나로 좁혀서 넘긴다.
 * - 값이 없는 달은 **결과에서 뺀다.** 0 으로 채우면 그 달만 GDD 가 멈춰 도달일이
 *   실제보다 늦게 나온다 — `forecastArrival_2` 는 없는 달을 만나면 거기서
 *   멈추고 "모른다"고 답하게 되어 있다.
 *
 * [Usage]
 * ```ts
 * foldMonthlyNormals([{ month: 9, tempMaxC: 28.5, tempMinC: 20.7 }, ...]);
 * // [{ month: 1, tempMaxC: 2.1, tempMinC: -5.5 }, ... ] (월 오름차순)
 * ```
 * ---------------------------------------------
 */

/** 평년값 한 행. 월만 쓰고 일은 버린다 — 어차피 월로 접는다. */
export interface NormalDay {
  /** 1~12. */
  month: number;
  tempMaxC: number | null;
  tempMinC: number | null;
}

/** 소수 한 자리. `gdd.ts` 의 `roundTenth` 와 같은 자릿수다. */
function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 일별 평년값을 월별 평균으로 접는다. 월 오름차순.
 *
 * 최고·최저를 **따로** 센다. 한쪽만 비는 행이 있어도 다른 쪽 평균은 성립하기
 * 때문이다. 둘 중 하나라도 비면 그 달은 GDD 를 못 내므로 결과에서 뺀다.
 */
export function foldMonthlyNormals(
  rows: readonly NormalDay[],
): MonthlyNormal[] {
  const sums = new Map<
    number,
    { maxSum: number; maxN: number; minSum: number; minN: number }
  >();

  for (const row of rows) {
    if (!Number.isInteger(row.month) || row.month < 1 || row.month > 12) {
      continue;
    }
    const acc = sums.get(row.month) ?? {
      maxSum: 0,
      maxN: 0,
      minSum: 0,
      minN: 0,
    };
    if (row.tempMaxC !== null && Number.isFinite(row.tempMaxC)) {
      acc.maxSum += row.tempMaxC;
      acc.maxN += 1;
    }
    if (row.tempMinC !== null && Number.isFinite(row.tempMinC)) {
      acc.minSum += row.tempMinC;
      acc.minN += 1;
    }
    sums.set(row.month, acc);
  }

  return [...sums.entries()]
    .filter(([, acc]) => acc.maxN > 0 && acc.minN > 0)
    .map(([month, acc]) => ({
      month,
      tempMaxC: roundTenth(acc.maxSum / acc.maxN),
      tempMinC: roundTenth(acc.minSum / acc.minN),
    }))
    .sort((a, b) => a.month - b.month);
}
