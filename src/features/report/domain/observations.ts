/**
 * ---------------------------------------------
 * [Feature]: 상주 관측소 실측 기록 (고정 데이터)
 *
 * [Description]
 * - 기상청 API허브 지상관측 일통계, 상주 관측소(STN 137)에서 받아온 **실측값**이다.
 *   예보가 아니라 이미 관측된 값이라 씨 뿌린 날부터 오늘까지를 거슬러 계산할 수 있다.
 * - 숫자를 보기 좋게 다듬지 않는다. 리포트가 "근거를 그대로 댈 수 있다"고 말하려면
 *   원본과 한 자리도 달라선 안 된다.
 * - ⚠️ 지금은 **고정 상수**다. 기상청 연동이 붙으면 이 파일의 값이 조회 결과로
 *   바뀌어야 한다. 그때까지 계산 함수들은 여기만 보면 된다.
 * - 날짜를 `Date` 가 아니라 `"MM-DD"` 문자열로 둔 이유: 이 데모는 특정 하루를
 *   고정해 보여주므로 실행 시각에 따라 결과가 바뀌면 안 된다. `Date.now()` 가
 *   끼어드는 순간 "어제는 되던 화면"이 생긴다.
 *
 * [Usage]
 * ```ts
 * import { RECENT_DAYS, SOWING_DATE } from "./observations";
 * accumulateGdd(RECENT_DAYS, SOWING_DATE, 5);
 * ```
 * ---------------------------------------------
 */

/** 하루치 관측. 기온은 ℃, 강수는 mm. */
export interface DailyObservation {
  /** `"MM-DD"`. 연도는 OBSERVATION_YEAR 하나로 고정한다. */
  date: string;
  tempMinC: number;
  tempMaxC: number;
  rainMm: number;
}

export const OBSERVATION_YEAR = 2026;

/** 관측소. 리포트 각주에 그대로 찍힌다. */
export const STATION = {
  nameKo: "경북 상주",
  id: 137,
  latitude: 36.4084,
  longitude: 128.1574,
  elevationM: 74,
} as const;

/** 이 화면이 "오늘"로 삼는 날. 실행 시각과 무관하게 고정한다. */
export const TODAY = "09-13";

/** 가을배추 씨뿌린 날. */
export const SOWING_DATE = "08-25";

/**
 * 최근 14일 실측. 기상청 API허브 원본 순서 그대로(오래된 날 → 오늘).
 *
 * 7일 강수 합계가 0.1mm 에 그친 것이 이 리포트의 출발점이다 — 값을 고치면
 * 화면의 "가을가뭄" 경보가 근거를 잃는다.
 */
export const RECENT_DAYS: readonly DailyObservation[] = [
  { date: "08-31", tempMinC: 23.0, tempMaxC: 26.9, rainMm: 53.5 },
  { date: "09-01", tempMinC: 22.7, tempMaxC: 32.2, rainMm: 0 },
  { date: "09-02", tempMinC: 23.1, tempMaxC: 29.2, rainMm: 0 },
  { date: "09-03", tempMinC: 22.2, tempMaxC: 28.9, rainMm: 0 },
  { date: "09-04", tempMinC: 19.0, tempMaxC: 28.9, rainMm: 0 },
  { date: "09-05", tempMinC: 16.2, tempMaxC: 28.6, rainMm: 0 },
  { date: "09-06", tempMinC: 17.3, tempMaxC: 29.1, rainMm: 0.4 },
  { date: "09-07", tempMinC: 15.1, tempMaxC: 28.7, rainMm: 0 },
  { date: "09-08", tempMinC: 14.8, tempMaxC: 28.2, rainMm: 0 },
  { date: "09-09", tempMinC: 14.8, tempMaxC: 25.5, rainMm: 0 },
  { date: "09-10", tempMinC: 12.1, tempMaxC: 23.2, rainMm: 0 },
  { date: "09-11", tempMinC: 14.0, tempMaxC: 27.1, rainMm: 0 },
  { date: "09-12", tempMinC: 15.1, tempMaxC: 28.1, rainMm: 0 },
  { date: "09-13", tempMinC: 15.0, tempMaxC: 28.8, rainMm: 0 },
];

/**
 * 올여름 최고기온 35℃ 이상이었던 날.
 *
 * 지나간 일이라 경보는 못 하지만, 감·포도의 일소재해(열매가 햇볕에 데는 것)는
 * 지금 살펴봐야 알 수 있어서 "확인해 보시라"는 안내의 근거가 된다.
 */
export const HOT_DAYS_OVER_35: readonly string[] = [
  "07-26",
  "08-01",
  "08-02",
  "08-03",
  "08-04",
  "08-06",
  "08-07",
  "08-08",
];

/** 씨뿌린 날부터 오늘까지 쌓인 실측만 잘라낸다. */
export function daysSince(
  rows: readonly DailyObservation[],
  fromDate: string,
): DailyObservation[] {
  return rows.filter((row) => row.date >= fromDate);
}

/**
 * 최근 n일 강수 합계.
 *
 * 배열 끝이 오늘이라는 전제로 뒤에서 n개를 센다. 날짜가 비어 있는 날
 * (관측 결측)은 배열에 아예 없으므로 "달력 기준 n일"과 다를 수 있다 —
 * 가뭄 판정은 관측이 있는 날만 보는 편이 안전하다(없는 날을 0mm 로 치면
 * 결측이 곧 가뭄이 된다).
 */
export function rainfallOverLastDays(
  rows: readonly DailyObservation[],
  days: number,
): number {
  const window = rows.slice(Math.max(0, rows.length - days));
  const total = window.reduce((sum, row) => sum + row.rainMm, 0);
  // 부동소수 누적 오차를 소수 첫째 자리에서 끊는다. 0.30000000000000004 가
  // 화면에 나가면 실측 데이터의 신뢰가 통째로 깎인다.
  return Math.round(total * 10) / 10;
}

/**
 * 씨뿌린 날(08-25)부터 관측 창이 시작되는 날(08-31) 직전까지 쌓인 적산온도.
 *
 * ⚠️ **이 값은 일별 원본이 없다.** 출처 PoC 가 14일치 관측만 싣고도 누적
 * 384.2 GDD(20일치)를 제시했는데, 빠진 6일(08-25~08-30)의 일별 기온이
 * 어디에도 없었다. 그 6일을 지어내면 "실측"이라는 이 화면의 주장 자체가
 * 무너지므로, 차액을 **하나의 상수로 드러내** 두었다.
 *
 *   14일 관측 합계 248.9 + 이 값 135.3 = 384.2 (출처 PoC 와 일치)
 *
 * 기상청 연동이 붙으면 이 상수는 사라지고 RECENT_DAYS 가 08-25 부터 시작해야 한다.
 * 그때까지는 "여기 근사가 하나 있다"가 코드에 보이는 편이 낫다.
 */
export const GDD_BEFORE_WINDOW = 135.3;
