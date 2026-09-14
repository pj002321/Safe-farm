/**
 * ---------------------------------------------
 * [Feature]: 오늘의 생육 리포트 조립
 *
 * [Description]
 * - 농민에게 나가는 리포트 5부 구조를 하나의 객체로 조립한다.
 *   ①현재 상태 요약 ②표준 단계 설명 ③잘 자라는 점 ④부족한 점과 처방 ⑤경고.
 * - 이 파일은 **조립만** 한다. 판정 규칙은 growthNotes.ts / growthAlerts.ts 에 있다.
 * - LLM을 부르지 않는 순수 함수다. 같은 입력이면 언제나 같은 문장이 나오고,
 *   틀린 문장이 나갔을 때 어떤 조건에서 나왔는지 되짚을 수 있다.
 *   `Date.now()`·난수를 쓰지 않으므로 "오늘"은 호출자가 넘긴 일수로만 정해진다.
 * - 판정 타입은 여기서 다시 내보낸다. 소비자가 리포트를 쓰려고 판정 파일까지
 *   찾아 들어갈 이유가 없기 때문이다.
 *
 * [Usage]
 * ```ts
 * const report = buildGrowthReport({
 *   cropId: "lettuce", daysSincePlanting: 32,
 *   recentAvgTempC: 24, recentRainMm: 2, sunshineHours: 6,
 *   forecastMinTempC: 3, forecastMaxTempC: 25, forecastRainMm: 1,
 * });
 * report.summary; // "상추를 심은 지 32일째예요. ..."
 * ```
 * ---------------------------------------------
 */

import { buildAlerts, type ReportAlert } from "./growthAlerts";
import {
  assessPace,
  buildDeficits,
  buildStrengths,
  type GrowthObservation,
  type NoteTone,
  type Pace,
  type ReportNote,
} from "./growthNotes";
import {
  CROP_CALENDARS,
  type CropCalendar,
  type GrowthStage,
  overallProgress,
  stageAt,
} from "./growthStage";

export type { GrowthObservation, NoteTone, Pace, ReportAlert, ReportNote };

export interface GrowthReport {
  cropId: string;
  cropNameKo: string;
  day: number;
  stage: GrowthStage;
  /** 전체 재배 기간 대비 진행률 0~1 */
  progress: number;
  /** 표준 대비 생장 속도 */
  pace: Pace;
  /** 표준 대비 편차 (일). 양수면 빠름. 반올림 정수. */
  paceDeltaDays: number;
  /** ① 현재 생육 상태 요약 — 2~3문장 */
  summary: string;
  /** ② 표준 생육 단계 설명 — 1~2문장 */
  standardStage: string;
  /** ③ 잘 자라고 있는 점 */
  strengths: ReportNote[];
  /** ④ 부족한 점 + 채우는 방법 (detail 에 처방을 포함) */
  deficits: ReportNote[];
  /** ⑤ 예보·경고·안전권고 */
  alerts: ReportAlert[];
}

/**
 * 받침 유무에 따라 조사를 고른다.
 *
 * 작물·단계 이름은 데이터라서 나중에 얼마든지 늘어난다. "감자를", "토마토을"
 * 같은 문장이 농민에게 나가지 않도록 여기서 한 번에 막는다.
 */
function withJosa(
  word: string,
  afterConsonant: string,
  afterVowel: string,
): string {
  const code = word.charCodeAt(word.length - 1);
  const isHangulSyllable = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isHangulSyllable && (code - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? afterConsonant : afterVowel}`;
}

/** ① 현재 상태 요약. "며칠째 + 지금 단계 + 표준 대비 속도" 세 문장. */
function buildSummary(
  calendar: CropCalendar,
  stage: GrowthStage,
  day: number,
  pace: Pace,
  paceDeltaDays: number,
): string {
  const planted = `${withJosa(calendar.nameKo, "을", "를")} 심은 지 ${day}일째예요.`;
  const now = `지금은 ${withJosa(stage.nameKo, "이라", "라")}, ${stage.adviceKo}`;

  const gap = Math.abs(paceDeltaDays);
  const paceLine =
    pace === "ahead"
      ? `지난주 날씨가 따뜻해서 자라는 속도는 표준보다 ${gap}일 정도 빠른 편이에요.`
      : pace === "behind"
        ? `지난주 기온이 낮아서 자라는 속도는 표준보다 ${gap}일 정도 느린 편이에요.`
        : "자라는 속도는 표준 일정과 비슷합니다.";

  return `${planted} ${now} ${paceLine}`;
}

/** ② 표준 생육 단계 설명. 오늘이 표준 일정의 어디쯤인지 숫자로 짚어 준다. */
function buildStandardStage(
  calendar: CropCalendar,
  stage: GrowthStage,
  progress: number,
): string {
  const index = calendar.stages.indexOf(stage);
  const next = calendar.stages[index + 1];
  const percent = Math.round(progress * 100);

  // 마지막 단계가 재배 종료일과 같은 날 시작하면(상추 추대기) 구간 폭이 0이다.
  // "45일부터 45일까지"라고 쓰지 않는다.
  const span =
    stage.startDay >= calendar.totalDays
      ? `파종 후 ${stage.startDay}일부터가`
      : `파종 후 ${stage.startDay}일부터 ${next ? next.startDay - 1 : calendar.totalDays}일까지가`;

  return `표준 재배 일정으로는 ${span} ${stage.nameKo}입니다. 전체 ${calendar.totalDays}일 과정에서 오늘은 ${percent}% 지점이에요.`;
}

/**
 * 관측 하나로 리포트 한 장을 만든다.
 *
 * 모르는 작물이면 **던진다.** 기본 작물로 조용히 넘어가면 상추 기준 처방이
 * 토마토 밭에 나간다. 물을 주라거나 부직포를 덮으라는 지시는 되돌릴 수 없고,
 * 농민은 그 문장이 다른 작물 기준이라는 걸 알 방법이 없다.
 */
export function buildGrowthReport(
  observation: GrowthObservation,
): GrowthReport {
  const calendar: CropCalendar | undefined = CROP_CALENDARS[observation.cropId];
  if (!calendar) {
    throw new Error(`알 수 없는 작물: ${observation.cropId}`);
  }

  const day = observation.daysSincePlanting;
  const stage = stageAt(calendar, day);
  const progress = overallProgress(calendar, day);
  const { pace, paceDeltaDays } = assessPace(
    calendar,
    observation.recentAvgTempC,
  );

  return {
    cropId: calendar.cropId,
    cropNameKo: calendar.nameKo,
    day,
    stage,
    progress,
    pace,
    paceDeltaDays,
    summary: buildSummary(calendar, stage, day, pace, paceDeltaDays),
    standardStage: buildStandardStage(calendar, stage, progress),
    strengths: buildStrengths(calendar, observation, pace),
    deficits: buildDeficits(calendar, observation),
    alerts: buildAlerts(calendar, observation),
  };
}
