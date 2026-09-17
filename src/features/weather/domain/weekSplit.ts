import type { PlotForecast } from "@/shared/aiService/client";
import { FROST_THRESHOLD_C } from "./forecastAlerts";

/**
 * ---------------------------------------------
 * [Feature]: 7일 예보 → 평일 / 주말 (순수)
 *
 * [Description]
 * - 홈의 날씨 칸이 답해야 하는 질문은 "몇 도냐"가 아니라 **"언제 밭에 나갈 수
 *   있냐"**다. 그래서 하루마다 `workableKo` 한 줄을 뽑는다.
 * - 평일과 주말을 나누는 이유: 직장을 가진 주말 농부와 상주하는 농민이 보는
 *   구간이 다르다. 한 목록에 7일을 늘어놓으면 양쪽 다 세어 가며 봐야 한다.
 * - **판단은 임계 비교뿐이다.** 여기서 새로운 기상학을 하지 않는다 — 넘었는지만
 *   보고, 근거가 없으면(값이 null) 판단을 보류한다.
 * - 임계는 상수로 드러내 둔다. 숫자가 코드 안에 박혀 있으면 나중에 "왜 9m/s 냐"를
 *   아무도 답할 수 없다.
 *
 * [Usage]
 * ```ts
 * const { weekdays, weekend } = splitWeek(forecast.days, forecast.cropImpact);
 * ```
 * ---------------------------------------------
 */

/**
 * 야외 작업이 불편해지는 풍속(m/s).
 *
 * 기상청 강풍주의보는 14m/s 다 — 그건 "위험"의 기준이고, 방제·비닐 작업은 그보다
 * 훨씬 아래에서 못 한다. 약제가 날리고 자재가 뜨는 구간을 9로 잡았다.
 * ⚠️ 이 값은 관측 기준이 아니라 **작업 편의 기준**이다. 경보로 쓰지 말 것.
 */
const WINDY_MS = 9;

/** 이 이상 오면 젖으면 안 되는 작업을 접어야 한다(mm). */
const WET_MM = 1;

/** 강수량이 적어도 확률이 이 이상이면 일정은 비를 전제로 짠다(%). */
const LIKELY_RAIN_PCT = 60;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export interface WorkDay {
  date: string;
  /** "수요일" / "토요일". 홈에서는 요일이 날짜보다 먼저 읽힌다. */
  labelKo: string;
  /** "9/17". 요일만으로는 다음 주인지 알 수 없다. */
  dateKo: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  rainChance: number | null;
  rainMm: number | null;
  /** 야외 작업이 가능한가. 이 칸의 목적이다. */
  workableKo: string;
  icon: "sun" | "rain" | "wind" | "frost";
}

type Day = PlotForecast["days"][number];
type CropImpact = PlotForecast["cropImpact"];

/**
 * 하루의 작업 가능 여부. 급한 것부터 본다 — 서리가 비보다, 비가 고온보다 먼저다.
 *
 * 값이 없으면 지어내지 않는다. 전부 모르면 "예보 없음"이라고 말한다.
 */
export function workability(
  day: Day,
  impact: CropImpact,
): { workableKo: string; icon: WorkDay["icon"] } {
  if (day.tempMin === null && day.tempMax === null && day.rainfallMm === null) {
    return { workableKo: "예보가 없습니다", icon: "sun" };
  }

  if (day.tempMin !== null && day.tempMin <= FROST_THRESHOLD_C) {
    return {
      workableKo: `서리 위험(최저 ${day.tempMin}℃) — 덮개부터 씌우세요`,
      icon: "frost",
    };
  }

  if (day.windMax !== null && day.windMax >= WINDY_MS) {
    return {
      workableKo: `바람이 강합니다(${Math.round(day.windMax)}m/s) — 방제·비닐 작업은 미루세요`,
      icon: "wind",
    };
  }

  const wet = day.rainfallMm !== null && day.rainfallMm >= WET_MM;
  const likely = day.rainChance !== null && day.rainChance >= LIKELY_RAIN_PCT;
  if (wet || likely) {
    return {
      workableKo: wet
        ? `비 ${day.rainfallMm}mm 예보 — 젖으면 안 되는 작업은 피하세요`
        : `비 올 확률 ${day.rainChance}% — 오전에 끝내는 게 안전합니다`,
      icon: "rain",
    };
  }

  if (
    impact?.upperTempC != null &&
    day.tempMax !== null &&
    day.tempMax > impact.upperTempC
  ) {
    return {
      workableKo: `한낮이 덥습니다(${Math.round(day.tempMax)}℃) — 이른 아침에 하세요`,
      icon: "sun",
    };
  }

  return { workableKo: "야외 작업하기 좋습니다", icon: "sun" };
}

function toWorkDay(day: Day, impact: CropImpact): WorkDay {
  const date = new Date(`${day.date}T00:00:00`);
  return {
    date: day.date,
    labelKo: `${WEEKDAY_KO[date.getDay()]}요일`,
    dateKo: `${date.getMonth() + 1}/${date.getDate()}`,
    tempMinC: day.tempMin,
    tempMaxC: day.tempMax,
    rainChance: day.rainChance,
    rainMm: day.rainfallMm,
    ...workability(day, impact),
  };
}

/** 토·일인가. `getDay()` 는 0이 일요일, 6이 토요일이다. */
function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

export function splitWeek(
  days: PlotForecast["days"],
  impact: CropImpact,
): { weekdays: WorkDay[]; weekend: WorkDay[] } {
  const weekdays: WorkDay[] = [];
  const weekend: WorkDay[] = [];

  for (const day of days) {
    (isWeekend(day.date) ? weekend : weekdays).push(toWorkDay(day, impact));
  }
  return { weekdays, weekend };
}
