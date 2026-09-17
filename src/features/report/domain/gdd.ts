import type { DailyObservation } from "./observations";

/**
 * ---------------------------------------------
 * [Feature]: 적산온도(GDD) 누적과 생육 진행 판정
 *
 * [Description]
 * - "며칠 남았나"를 정하는 계산이 전부 여기 있다. 화면도, LLM 문장도 이 결과를
 *   받아쓰기만 한다 — 판단을 LLM 에 맡기면 입력에 없는 숫자를 지어낸다.
 * - GDD(Growing Degree Days)는 **날짜가 아니라 쌓인 열**로 생육을 재는 방법이다.
 *   같은 20일이라도 더웠으면 더 자란다. 농진청 작형표가 "8월 상순~하순"처럼
 *   폭넓게 적힌 이유이자, 우리가 날짜 대신 이걸 쓰는 이유다.
 * - 순수 함수만 둔다. `Date.now()` 를 쓰지 않으므로 같은 입력이면 언제 실행해도
 *   같은 값이 나오고, 틀린 숫자가 화면에 나갔을 때 되짚을 수 있다.
 *
 * [Usage]
 * ```ts
 * const acc = accumulateGdd(RECENT_DAYS, SOWING_DATE, CABBAGE.baseTempC);
 * const total = acc + GDD_BEFORE_WINDOW;
 * daysToTarget(total, recentDailyGdd(RECENT_DAYS, 7, 5), 505); // 약 8
 * ```
 * ---------------------------------------------
 */

/**
 * 하루치 적산온도. 기준온도 아래로 내려간 날은 0 이다(음수를 빼지 않는다).
 *
 * 작물은 기준온도 아래에서 자라지 않을 뿐 **거꾸로 줄지 않는다.** 음수를 그대로
 * 더하면 추운 날이 지난 성장을 되돌리는 꼴이 되어 누적값이 실제보다 작아진다.
 *
 *     상한 없음 — Standard
 *         GDD = max((Tmax + Tmin)/2 − Tbase, 0)
 *
 *     상한 있음 — Modified (Tmax·Tmin 개별 클램프)
 *         Tmax' = min(Tmax, Tupper) · Tmin' = max(Tmin, Tbase)
 *         GDD   = max((Tmax' + Tmin')/2 − Tbase, 0)
 *
 * 왜 각각 자르나: 평균을 먼저 내고 자르면 **더운 낮의 정체가 서늘한 밤에 가려진다.**
 * Tmax 36℃ 여도 Tmin 이 낮으면 평균이 상한 아래라 안 잘린다.
 * 옥수수 폭염일(36/24)에 이 식은 17, 평균을 먼저 자르면 20 — 한 철이면 15% 갈린다.
 *
 * ⚠ Tmin 클램프는 **상한이 있을 때만** 건다. 상한 없이 Tmin 만 자르면 일반 GDD 와
 * 어긋난다 (상추 18/2 → 6 이 아니라 7). 두 줄을 분기 밖으로 빼지 말 것.
 *
 * ⚠ **역산과 운영은 반드시 같은 식이어야 한다.** gdd_target 은 이 식으로 역산해
 * 만든 값이다. 여기만 바꾸면 목표값이 통째로 어긋난다.
 * 근거는 safefarm-crop-data 의 GDD_작업인계.md §1-1 · §1-1a (두 번 뒤집힌 판단이다).
 */
export function dailyGdd(
  tempMaxC: number,
  tempMinC: number,
  baseTempC: number,
  upperTempC?: number,
): number {
  if (upperTempC === undefined) {
    return Math.max(0, (tempMaxC + tempMinC) / 2 - baseTempC);
  }
  return Math.max(
    0,
    (Math.min(tempMaxC, upperTempC) + Math.max(tempMinC, baseTempC)) / 2 -
      baseTempC,
  );
}

/** 기준일 이후 관측만 골라 적산온도를 더한다. */
export function accumulateGdd(
  rows: readonly DailyObservation[],
  fromDate: string,
  baseTempC: number,
  upperTempC?: number,
): number {
  const total = rows
    .filter((row) => row.date >= fromDate)
    .reduce(
      (sum, row) =>
        sum + dailyGdd(row.tempMaxC, row.tempMinC, baseTempC, upperTempC),
      0,
    );
  return roundTenth(total);
}

/**
 * 최근 n일 평균 적산온도(GDD/일).
 *
 * 남은 일수를 추정하는 분모다. 한 해 평균이 아니라 **최근**을 쓰는 이유는
 * 계절이 바뀌는 중이라서다 — 9월 중순 배추에 8월 평균을 적용하면 너무 빠르게
 * 나온다. 배열 끝이 오늘이라는 전제로 뒤에서 n개를 센다.
 */
export function recentDailyGdd(
  rows: readonly DailyObservation[],
  days: number,
  baseTempC: number,
  upperTempC?: number,
): number {
  const window = rows.slice(Math.max(0, rows.length - days));
  if (window.length === 0) return 0;
  const total = window.reduce(
    (sum, row) =>
      sum + dailyGdd(row.tempMaxC, row.tempMinC, baseTempC, upperTempC),
    0,
  );
  return roundTenth(total / window.length);
}

/**
 * 목표 적산온도까지 남은 일수.
 *
 * 이미 넘겼으면 0. 최근 기온이 기준온도 아래로만 이어져 `perDay` 가 0 이면
 * **추정할 수 없다**(0 으로 나누면 Infinity 가 화면에 나간다). 그때는 null 을
 * 돌려주고, 화면이 "지금 기온으로는 예측할 수 없다"고 말하게 한다 —
 * 임의의 큰 수로 때우면 사용자가 그 숫자를 믿어버린다.
 */
export function daysToTarget(
  accumulated: number,
  perDay: number,
  target: number,
): number | null {
  if (accumulated >= target) return 0;
  if (perDay <= 0) return null;
  return Math.round((target - accumulated) / perDay);
}

/** 목표 대비 진행률 0~1. 넘겨도 1 을 넘지 않는다(게이지가 칸을 삐져나간다). */
export function progressRatio(accumulated: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, Math.max(0, accumulated / target));
}

/**
 * 소수 첫째 자리 반올림.
 *
 * 부동소수 누적 오차를 끊는다. `384.20000000000005` 가 화면에 나가면
 * 실측 데이터라는 주장 자체가 의심받는다.
 */
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
