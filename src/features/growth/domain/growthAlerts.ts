/**
 * ---------------------------------------------
 * [Feature]: 생육 리포트 예보 경고
 *
 * [Description]
 * - 리포트 5부 중 ⑤예보·경고·안전권고만 담당한다. growthNotes.ts 가 "지금까지"를
 *   읽는다면 여기는 "앞으로"를 읽는다. 판단 근거가 관측이 아니라 예보라
 *   임계값 성격도 다르고, 오경보의 대가도 다르므로 파일을 나눴다.
 * - 경고에는 반드시 `action`(오늘 할 일)과 `leadTimeHours`(남은 시간)를 붙인다.
 *   "위험합니다"만 알리고 무엇을 하라고 말하지 않는 경보는 무시당한다.
 *
 * [Usage]
 * ```ts
 * const alerts = buildAlerts(CROP_CALENDARS.lettuce, observation);
 * ```
 * ---------------------------------------------
 */

import {
  type GrowthObservation,
  type ReportNote,
  roundTenth,
} from "./growthNotes";
import type { CropCalendar } from "./growthStage";

export interface ReportAlert extends ReportNote {
  /** 농민이 오늘/내일 해야 할 구체적 행동 */
  action: string;
  /** 대응 가능 시간 (시간 단위). 경보 긴급도 표시에 쓴다 */
  leadTimeHours: number;
}

/** 이 이상 예보되면 침수·유실 위험 구간으로 본다 (3일 누적 mm). */
const FLOOD_RAIN_MM = 80;

/** 이 아래면 "비가 온다"고 볼 수 없는 양. 가뭄 지속 판단의 기준. */
const NEGLIGIBLE_RAIN_MM = 5;

/**
 * 예보 기반 경고 목록.
 *
 * 해당 없으면 **빈 배열**이다. 억지로 한 줄 채우면 경보가 흔해지고, 흔한 경보는
 * 읽히지 않는다. "특별한 경고 없음"을 보여주는 건 화면의 몫이다.
 */
export function buildAlerts(
  calendar: CropCalendar,
  observation: GrowthObservation,
): ReportAlert[] {
  const alerts: ReportAlert[] = [];
  const { forecastMinTempC, forecastMaxTempC, forecastRainMm, recentRainMm } =
    observation;

  if (forecastMinTempC <= calendar.frostRiskBelowC) {
    alerts.push({
      id: "alert-frost",
      title: "냉해·서리 주의",
      detail: `내일 새벽 기온이 ${roundTenth(forecastMinTempC)}도까지 떨어질 예정입니다. ${calendar.nameKo}는 ${calendar.frostRiskBelowC}도 아래에서 잎이 상합니다.`,
      action: "부직포나 비닐을 덮어두세요.",
      tone: "unsuitable",
      leadTimeHours: 12,
    });
  }

  if (forecastMaxTempC >= calendar.heatRiskAboveC) {
    alerts.push({
      id: "alert-heat",
      title: "고온 장해 주의",
      detail: `앞으로 사흘 최고기온이 ${roundTenth(forecastMaxTempC)}도까지 오릅니다. ${calendar.heatRiskAboveC}도를 넘으면 생육이 멈추고 품질이 떨어집니다.`,
      action: "한낮에는 차광망을 치고, 물은 이른 아침에 주세요.",
      tone: "caution",
      leadTimeHours: 24,
    });
  }

  if (forecastRainMm >= FLOOD_RAIN_MM) {
    alerts.push({
      id: "alert-flood",
      title: "호우·침수 주의",
      detail: `앞으로 사흘 ${Math.round(forecastRainMm)}mm 의 비가 예보됐습니다. 물이 빠지지 않으면 뿌리가 잠깁니다.`,
      action: "비가 오기 전에 배수로를 점검하고 고랑을 터 두세요.",
      tone: "unsuitable",
      leadTimeHours: 24,
    });
  }

  if (
    forecastRainMm < NEGLIGIBLE_RAIN_MM &&
    recentRainMm < calendar.idealWeeklyRainMm[0]
  ) {
    alerts.push({
      id: "alert-drought",
      title: "가뭄 지속 주의",
      detail:
        "지난주에 이어 앞으로 사흘도 비 소식이 거의 없습니다. 토양이 계속 마릅니다.",
      action: "며칠에 한 번 흠뻑 주는 방식으로 물 주는 일정을 잡아 두세요.",
      tone: "caution",
      leadTimeHours: 72,
    });
  }

  return alerts;
}
