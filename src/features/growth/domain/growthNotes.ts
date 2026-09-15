/**
 * ---------------------------------------------
 * [Feature]: 생육 리포트 상태 판정
 *
 * [Description]
 * - 리포트 5부 중 ③잘 자라는 점 · ④부족한 점을 판정한다. 즉 **지금까지의 관측**을
 *   읽는 자리다. 앞으로의 예보를 읽는 ⑤경고는 growthAlerts.ts 가 맡는다.
 *   문장 **조립**은 growthReport.ts 의 책임이다. 셋을 한 파일에 두면 300줄을 넘고,
 *   임계값 하나 고칠 때마다 문장 템플릿까지 읽어야 한다.
 * - LLM을 부르지 않는다. 규칙 기반이라 같은 입력이면 같은 문장이 나오고,
 *   틀린 처방이 나왔을 때 어느 조건에서 나왔는지 추적할 수 있다.
 * - 임계값은 전부 상수로 뽑고 근거를 주석에 남긴다.
 *
 * [Usage]
 * ```ts
 * const { pace, paceDeltaDays } = assessPace(calendar, 24);
 * const deficits = buildDeficits(calendar, observation);
 * ```
 * ---------------------------------------------
 */

import type { CropCalendar } from "./growthStage";

/** 한 필지의 최근 관측값 + 단기 예보. 리포트의 유일한 입력이다. */
export interface GrowthObservation {
  cropId: string;
  /** 파종 후 일수 */
  daysSincePlanting: number;
  /** 최근 7일 평균기온 (°C) */
  recentAvgTempC: number;
  /** 최근 7일 누적 강수량 (mm) */
  recentRainMm: number;
  /** 최근 7일 일 평균 일조시간 (h) */
  sunshineHours: number;
  /** 내일 새벽 예상 최저기온 (°C) */
  forecastMinTempC: number;
  /** 향후 3일 예상 최고기온 (°C) */
  forecastMaxTempC: number;
  /** 향후 3일 예상 강수량 (mm) */
  forecastRainMm: number;
}

/** 표준 대비 생장 속도. */
export type Pace = "ahead" | "onTrack" | "behind";

export type NoteTone = "good" | "caution" | "unsuitable" | "info";

export interface ReportNote {
  /** 안정적인 React key 로 쓴다 */
  id: string;
  title: string;
  detail: string;
  tone: NoteTone;
}

/**
 * 적정 기온대를 1°C 벗어난 상태가 일주일 이어졌을 때의 생육 편차(일).
 *
 * 근거: 생육 속도는 유효적산온도(GDD)에 거의 비례한다. 1°C × 7일 = 7 GDD 이고,
 * 잎채소·과채류가 하루치 생육에 쓰는 유효적산온도가 대략 9 GDD 이므로 7/9 ≈ 0.8일.
 * 적정 범위 **안**이면 편차 0으로 본다 — 표준 범위가 곧 표준 속도라는 뜻이다.
 */
const PACE_DAYS_PER_DEGREE = 0.8;

/**
 * 편차 상한(일). 기온이 크게 벗어나면 생육이 빨라지는 게 아니라 장해가 난다.
 * 40도에서 "20일 빠름"이라고 말하면 거짓말이 된다 — 실제 피해는 경보가 알린다.
 */
const MAX_PACE_DELTA_DAYS = 7;

/** 이 이상이면 대부분의 노지 작물이 광포화에 가까워지는 일 평균 일조시간. */
const ENOUGH_SUNSHINE_HOURS = 5;

/** 이 아래로 내려가면 웃자람(연약생장)이 시작된다. */
const LOW_SUNSHINE_HOURS = 3.5;

/**
 * 소수 첫째 자리까지 자른다.
 * 관측값을 그대로 노출하면 "23.99999도까지 떨어집니다" 같은 문장이 나간다.
 */
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 최근 기온으로 표준 대비 생장 속도를 판정한다.
 *
 * 반올림한 편차를 기준으로 라벨을 정한다 — 화면에 "2일 빠름"이라 적어 놓고
 * 라벨이 "표준"이면 농민이 어느 쪽을 믿어야 할지 알 수 없기 때문이다.
 */
export function assessPace(
  calendar: CropCalendar,
  recentAvgTempC: number,
): { pace: Pace; paceDeltaDays: number } {
  const [min, max] = calendar.idealTempC;
  // NaN 은 두 비교 모두 false 라 자연히 편차 0(표준)으로 떨어진다.
  const excessC =
    recentAvgTempC > max
      ? recentAvgTempC - max
      : recentAvgTempC < min
        ? recentAvgTempC - min
        : 0;

  const bounded = Math.min(
    MAX_PACE_DELTA_DAYS,
    Math.max(-MAX_PACE_DELTA_DAYS, excessC * PACE_DAYS_PER_DEGREE),
  );
  const paceDeltaDays = Math.round(bounded);

  const pace: Pace =
    Math.abs(paceDeltaDays) <= 1
      ? "onTrack"
      : paceDeltaDays > 0
        ? "ahead"
        : "behind";

  return { pace, paceDeltaDays };
}

/**
 * ③ 잘 자라고 있는 점.
 *
 * 해당하는 것만 담되 **절대 빈 배열로 돌려주지 않는다.** 빈 배열이면 화면의
 * "잘 자라고 있는 점" 칸이 통째로 비어, 농민이 "우리 밭은 좋은 게 하나도
 * 없구나"로 읽는다. 최악의 조건에서도 사실인 한 가지는 남긴다.
 */
export function buildStrengths(
  calendar: CropCalendar,
  observation: GrowthObservation,
  pace: Pace,
): ReportNote[] {
  const notes: ReportNote[] = [];
  const [tMin, tMax] = calendar.idealTempC;
  const [rMin, rMax] = calendar.idealWeeklyRainMm;
  const { daysSincePlanting, recentAvgTempC, recentRainMm, sunshineHours } =
    observation;

  if (recentAvgTempC >= tMin && recentAvgTempC <= tMax) {
    notes.push({
      id: "temp-ok",
      title: "기온이 알맞습니다",
      detail: `지난 일주일 평균 ${roundTenth(recentAvgTempC)}도로 ${calendar.nameKo} 표준 범위(${tMin}~${tMax}도) 안에 있습니다.`,
      tone: "good",
    });
  }

  if (recentRainMm >= rMin && recentRainMm <= rMax) {
    notes.push({
      id: "rain-ok",
      title: "물 사정이 좋습니다",
      detail: `지난 일주일 비가 ${roundTenth(recentRainMm)}mm 내려 표준(${rMin}~${rMax}mm)에 맞습니다. 따로 물을 주지 않아도 됩니다.`,
      tone: "good",
    });
  }

  if (sunshineHours >= ENOUGH_SUNSHINE_HOURS) {
    notes.push({
      id: "sun-ok",
      title: "볕이 충분합니다",
      detail: `하루 평균 ${roundTenth(sunshineHours)}시간씩 햇볕을 받았습니다. 잎이 단단하게 자랍니다.`,
      tone: "good",
    });
  }

  if (pace === "onTrack") {
    notes.push({
      id: "pace-ontrack",
      title: "표준 속도로 자라고 있습니다",
      detail:
        "표준 재배 일정과 거의 같은 속도입니다. 지금 관리를 그대로 이어가세요.",
      tone: "good",
    });
  } else if (pace === "ahead") {
    notes.push({
      id: "pace-ahead",
      title: "자라는 속도가 빠릅니다",
      detail:
        "따뜻한 날씨 덕에 표준보다 앞서 있습니다. 수확 준비를 조금 당겨 두세요.",
      tone: "good",
    });
  }

  if (daysSincePlanting >= 0 && daysSincePlanting <= calendar.totalDays) {
    notes.push({
      id: "schedule-ok",
      title: "재배 일정 안에 있습니다",
      detail: `표준 ${calendar.totalDays}일 과정 중 ${daysSincePlanting}일째로, 정상 일정 안입니다.`,
      tone: "good",
    });
  }

  if (notes.length === 0) {
    notes.push({
      id: "stage-normal",
      title: "단계 자체는 정상 범위 안에 있어요",
      detail: `${calendar.nameKo}는 조건이 나빠도 잎이 남아 있으면 회복합니다. 아래 부족한 점부터 하나씩 채워 보세요.`,
      tone: "info",
    });
  }

  return notes;
}

/** ④ 부족한 점과 채우는 방법. detail 의 마지막 문장이 곧 처방이다. */
export function buildDeficits(
  calendar: CropCalendar,
  observation: GrowthObservation,
): ReportNote[] {
  const notes: ReportNote[] = [];
  const [tMin, tMax] = calendar.idealTempC;
  const [rMin, rMax] = calendar.idealWeeklyRainMm;
  const { recentAvgTempC, recentRainMm, sunshineHours } = observation;

  if (recentRainMm < rMin) {
    notes.push({
      id: "rain-short",
      title: "물이 부족합니다",
      detail: `최근 일주일 강수량이 ${roundTenth(recentRainMm)}mm 로 표준(${rMin}~${rMax}mm)에 못 미칩니다. 오늘 아침에 물을 충분히 주세요. 이랑 사이가 젖을 만큼이면 됩니다.`,
      tone: "caution",
    });
  } else if (recentRainMm > rMax) {
    notes.push({
      id: "rain-excess",
      title: "물이 너무 많습니다",
      detail: `최근 일주일 강수량이 ${roundTenth(recentRainMm)}mm 로 표준(${rMin}~${rMax}mm)을 넘었습니다. 고랑에 물이 고이지 않게 배수로를 터 주세요. 뿌리가 잠긴 채로 며칠 지나면 회복이 어렵습니다.`,
      tone: "caution",
    });
  }

  if (sunshineHours < LOW_SUNSHINE_HOURS) {
    notes.push({
      id: "sun-short",
      title: "볕이 모자랍니다",
      detail: `하루 평균 일조가 ${roundTenth(sunshineHours)}시간뿐이라 줄기가 웃자랄 수 있습니다. 주변 잡초와 아래쪽 묵은 잎을 정리해 빛이 들게 하고, 질소 비료는 잠시 줄여 주세요.`,
      tone: "caution",
    });
  }

  if (recentAvgTempC < tMin) {
    notes.push({
      id: "temp-low",
      title: "기온이 낮습니다",
      detail: `지난 일주일 평균 ${roundTenth(recentAvgTempC)}도로 표준(${tMin}~${tMax}도)보다 낮아 생육이 더딥니다. 낮에는 걷고 밤에만 덮는 식으로 부직포를 써 주세요.`,
      tone:
        recentAvgTempC < calendar.frostRiskBelowC ? "unsuitable" : "caution",
    });
  } else if (recentAvgTempC > tMax) {
    notes.push({
      id: "temp-high",
      title: "기온이 높습니다",
      detail: `지난 일주일 평균 ${roundTenth(recentAvgTempC)}도로 표준(${tMin}~${tMax}도)을 넘었습니다. 한낮에는 차광망을 치고, 물은 해 뜨기 전 이른 아침에 주세요.`,
      tone: recentAvgTempC > calendar.heatRiskAboveC ? "unsuitable" : "caution",
    });
  }

  return notes;
}
