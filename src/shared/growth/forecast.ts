import { type DailyTemp, dailyGdd, roundTenth } from "./gdd";

/**
 * ---------------------------------------------
 * [Feature]: 다음 단계·수확 도달일 예측 (순수)
 *
 * [Description]
 * - `gdd.ts` 의 `daysToTarget()` 은 "최근 평균이 계속된다면" 을 가정한 한 줄
 *   나눗셈이다. 여기서는 **하루씩 실제로 쌓아 본다** — 예보가 있는 날은 예보
 *   기온으로, 없는 날은 규칙으로 메운다. 환절기에는 두 방식의 답이 열흘 넘게
 *   갈린다.
 * - 메우는 규칙이 하나로 정해지지 않아 `forecastArrival_1` · `_2` 두 벌을 둔다.
 *   **호출부에서 `ARRIVAL_RULE` 한 줄만 바꾸면 갈아 끼워진다** — 두 함수는
 *   같은 `ArrivalRule` 타입이다. 고른 뒤 안 쓰는 쪽은 지운다.
 * - 못 맞히는 것을 못 맞힌다고 말한다. `horizonDays` 를 넘도록 목표에 못 닿으면
 *   `arrivalDate: null` 이다. 임의의 먼 날짜를 내놓으면 사용자가 그 날짜를 믿는다.
 *
 * [Usage]
 * ```ts
 * const ARRIVAL_RULE: ArrivalRule = forecastArrival_1;
 * ARRIVAL_RULE({ accumulatedGdd: 380, targetGdd: 505, ... }).arrivalDate;
 * // "2026-09-28"
 * ```
 * ---------------------------------------------
 */

/** 월별 평년 기온. `forecastArrival_2` 가 예보 밖 구간을 메울 때 쓴다. */
export interface MonthlyNormal {
  /** 1~12. */
  month: number;
  tempMaxC: number;
  tempMinC: number;
}

export interface ArrivalInput {
  /** 지금까지 쌓인 GDD. */
  accumulatedGdd: number;
  /** 닿아야 할 GDD. 다음 단계면 `stage.gddTo`, 수확이면 `gddTarget`. */
  targetGdd: number;
  baseTempC: number;
  upperTempC: number | null;
  /** 내일부터의 예보. 날짜 오름차순. 없으면 빈 배열. */
  forecast: readonly DailyTemp[];
  /** 최근 관측. `_1` 이 평균을 내는 재료다. 날짜 오름차순. */
  recent: readonly DailyTemp[];
  /** 월별 평년값. `_2` 만 읽는다. 비어 있으면 `_2` 는 예보 끝에서 멈춘다. */
  normals: readonly MonthlyNormal[];
  /** 오늘 (`"YYYY-MM-DD"`). 호출자가 넘긴다. */
  today: string;
  /** 며칠까지 내다볼지. 이 안에 못 닿으면 예측 실패로 본다. */
  horizonDays: number;
}

export interface ArrivalForecast {
  /** 도달 예상일 (`"YYYY-MM-DD"`). 기간 안에 못 닿으면 null. */
  arrivalDate: string | null;
  /** 오늘부터 며칠 뒤인가. 이미 넘겼으면 0, 못 맞히면 null. */
  daysLeft: number | null;
  /** 예보만으로 닿은 날 수. 나머지는 규칙으로 메운 구간이다. */
  forecastDays: number;
  /** 예보 밖 구간을 메워서 나온 답인가. 화면이 "추정" 꼬리표를 붙인다. */
  extrapolated: boolean;
}

/** 두 변형이 공유하는 모양. 호출부는 이 타입으로만 붙잡는다. */
export type ArrivalRule = (input: ArrivalInput) => ArrivalForecast;

const DAY_MS = 86_400_000;

/** 하루 뒤 날짜. UTC 자정 기준이라 서머타임에 흔들리지 않는다. */
function nextDay(date: string): string {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(stamp)) return date;
  return new Date(stamp + DAY_MS).toISOString().slice(0, 10);
}

/** `"YYYY-MM-DD"` 의 월(1~12). */
function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/** 이미 닿은 경우의 답. 두 변형이 같은 값을 내야 해서 한 곳에 둔다. */
const ARRIVED: Omit<ArrivalForecast, "arrivalDate"> = {
  daysLeft: 0,
  forecastDays: 0,
  extrapolated: false,
};

/**
 * 하루씩 쌓아 목표에 닿는 날을 찾는다.
 *
 * `fill` 이 예보 밖 하루치 기온을 만든다. 그 함수가 null 을 주면 더 갈 수 없다는
 * 뜻이라 그 자리에서 멈춘다 — 두 변형의 차이가 이 함수 하나로 좁혀진다.
 */
function walk(
  input: ArrivalInput,
  fill: (date: string) => DailyTemp | null,
): ArrivalForecast {
  if (input.accumulatedGdd >= input.targetGdd) {
    return { ...ARRIVED, arrivalDate: input.today };
  }

  const upper = input.upperTempC ?? undefined;
  const byDate = new Map(input.forecast.map((row) => [row.date, row]));

  let accumulated = input.accumulatedGdd;
  let date = input.today;
  let forecastDays = 0;
  let filledDays = 0;

  for (let step = 0; step < input.horizonDays; step += 1) {
    date = nextDay(date);

    const forecasted = byDate.get(date);
    const row = forecasted ?? fill(date);
    if (row === null) break;
    if (forecasted) forecastDays += 1;
    else filledDays += 1;

    accumulated += dailyGdd(row.tempMaxC, row.tempMinC, input.baseTempC, upper);

    if (accumulated >= input.targetGdd) {
      return {
        arrivalDate: date,
        daysLeft: step + 1,
        forecastDays,
        extrapolated: filledDays > 0,
      };
    }
  }

  return {
    arrivalDate: null,
    daysLeft: null,
    forecastDays,
    extrapolated: filledDays > 0,
  };
}

/** 최근 관측의 평균 최고·최저. 관측이 없으면 null. */
function recentAverage(rows: readonly DailyTemp[]): DailyTemp | null {
  if (rows.length === 0) return null;
  const max = rows.reduce((sum, row) => sum + row.tempMaxC, 0) / rows.length;
  const min = rows.reduce((sum, row) => sum + row.tempMinC, 0) / rows.length;
  return { date: "", tempMaxC: roundTenth(max), tempMinC: roundTenth(min) };
}

/**
 * **변형 1 — 최근 관측 평균을 반복한다.**
 *
 * 예보가 끝난 뒤에는 "요즘 날씨가 계속된다"고 본다. 추가 데이터가 필요 없어
 * 지금 바로 돌아가는 유일한 쪽이다.
 *
 * 약점은 계절이 바뀌는 구간이다. 9월 하순 기온을 11월까지 늘려 잡으면 도달일이
 * 실제보다 이르게 나온다. 목표가 2~3주 안이면 차이가 거의 없다.
 */
export const forecastArrival_1: ArrivalRule = (input) => {
  const average = recentAverage(input.recent);
  return walk(input, (date) =>
    average === null ? null : { ...average, date },
  );
};

/**
 * **변형 2 — 월별 평년값으로 메운다.**
 *
 * 예보 밖은 그 날짜가 속한 달의 평년 기온으로 채운다. 계절 변화를 따라가므로
 * 한 달 넘게 내다볼 때 변형 1보다 맞는다.
 *
 * 평년값은 `shared/growth/normalStore.ts` 가 `normals` 에서 읽어 월별로 접어
 * 넘긴다. 그 달 값이 없으면 예보 끝에서 멈춰 `arrivalDate: null` 이 나온다 —
 * 틀린 날짜를 내놓느니 모른다고 하는 쪽이다.
 */
export const forecastArrival_2: ArrivalRule = (input) => {
  const byMonth = new Map(input.normals.map((row) => [row.month, row]));
  return walk(input, (date) => {
    const normal = byMonth.get(monthOf(date));
    if (normal === undefined) return null;
    return {
      date,
      tempMaxC: normal.tempMaxC,
      tempMinC: normal.tempMinC,
    };
  });
};
