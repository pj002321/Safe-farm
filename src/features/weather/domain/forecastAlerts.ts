import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 밭 예보 → "그래서 뭘 해야 하나" (순수)
 *
 * [Description]
 * - 7일치 숫자를 사람이 눈으로 훑어 위험한 날을 찾게 하지 않는다. 임계를 넘는
 *   날만 뽑아 **카드 맨 위**에 모은다. 예전 화면은 서리 경고를 해당 날짜 줄
 *   아래에 붙여서, 5일 뒤 서리를 보려면 표를 끝까지 내려야 했다.
 * - **정상인 날은 말하지 않는다.** 예전에는 하루하루마다 "배추 생육 적온"을
 *   적었다. 일곱 줄이 전부 무언가를 말하면 정작 이상한 날이 묻힌다. 그래서
 *   여기서 나오는 것은 **넘은 것뿐**이다.
 * - 근거가 없으면 판정하지 않는다. 작물 기준(`cropImpact`)이 없으면 고온·저온·
 *   관수는 아예 만들지 않는다 — `task_rules.py` 와 같은 방침이다.
 * - 순수 함수다. 날짜 포맷도 여기서 하지 않는다(로케일은 화면의 몫).
 *
 * [Usage]
 * ```ts
 * const alerts = buildForecastAlerts(forecast);
 * const flag = dayFlag(forecast.days[0], forecast.cropImpact);
 * ```
 * ---------------------------------------------
 */

/** 서리 위험 임계(℃). 최저기온이 이 이하면 실제로 서리가 내릴 수 있다. */
export const FROST_THRESHOLD_C = 2;

export type AlertTone = "danger" | "caution" | "info";

export interface ForecastAlert {
  /** React key 이자 종류 구분. 같은 종류는 한 장으로 합쳐 나온다. */
  id: "official" | "frost" | "hot" | "cold" | "water";
  tone: AlertTone;
  titleKo: string;
  bodyKo: string;
  /** 해당하는 날짜(YYYY-MM-DD). 특보·관수처럼 날짜가 없는 것은 빈 배열. */
  dates: string[];
}

/**
 * 하루가 어떤 이유로 걸렸는지. 표의 그 줄에 색을 주는 데 쓴다.
 *
 * 서리가 저온보다 먼저다 — 둘 다 해당하면 더 급한 쪽을 보여준다.
 */
export type DayFlag = "frost" | "hot" | "cold" | null;

type Day = PlotForecast["days"][number];
type CropImpact = PlotForecast["cropImpact"];

export function dayFlag(day: Day, impact: CropImpact): DayFlag {
  if (day.tempMin != null && day.tempMin <= FROST_THRESHOLD_C) return "frost";
  if (!impact) return null;
  if (
    impact.upperTempC != null &&
    day.tempMax != null &&
    day.tempMax > impact.upperTempC
  ) {
    return "hot";
  }
  if (day.tempMin != null && day.tempMin < impact.baseTempC) return "cold";
  return null;
}

/** "9-21" 처럼 사람이 읽는 짧은 날짜. 연도는 7일 안이라 필요 없다. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function joinDates(dates: string[]): string {
  return dates.map(shortDate).join(", ");
}

export function buildForecastAlerts(forecast: PlotForecast): ForecastAlert[] {
  const alerts: ForecastAlert[] = [];
  const impact = forecast.cropImpact;

  // 1) 기상청 특보가 가장 위다. 우리가 임계로 판정한 것이 아니라 공식 발효다.
  if (forecast.alert && forecast.alert.warnings.length > 0) {
    alerts.push({
      id: "official",
      tone: "danger",
      // 제목은 `label`(예: "강풍주의보")을 그대로 쓴다. 주의보와 경보는 대응이
      // 다른데 종류만("강풍") 적으면 그 차이가 사라진다. label 이 없을 때만
      // 종류를 이어 붙인다.
      titleKo: `${forecast.alert.label ?? forecast.alert.warnings.join(" · ")} 발효 중`,
      bodyKo:
        "기상청이 이 지역에 발효한 특보입니다. 야외 작업과 시설 고정을 먼저 확인하세요.",
      dates: [],
    });
  }

  const frostDays = forecast.days.filter(
    (d) => d.tempMin != null && d.tempMin <= FROST_THRESHOLD_C,
  );
  if (frostDays.length > 0) {
    const lowest = Math.min(
      ...frostDays.map((d) => d.tempMin as number),
    ).toFixed(1);
    alerts.push({
      id: "frost",
      tone: "danger",
      titleKo: `서리 위험 ${frostDays.length}일 (최저 ${lowest}℃)`,
      bodyKo:
        "덮개·부직포로 작물을 덮거나, 해 지기 전 관수로 지열을 붙잡아 두세요.",
      dates: frostDays.map((d) => d.date),
    });
  }

  if (impact?.upperTempC != null) {
    const upper = impact.upperTempC;
    const hotDays = forecast.days.filter(
      (d) => d.tempMax != null && d.tempMax > upper,
    );
    if (hotDays.length > 0) {
      alerts.push({
        id: "hot",
        tone: "caution",
        titleKo: `고온 ${hotDays.length}일 — ${impact.cropNameKo} 상한 ${upper}℃ 초과`,
        bodyKo: `${joinDates(hotDays.map((d) => d.date))}. 한낮 작업을 피하고 물 마름을 자주 확인하세요.`,
        dates: hotDays.map((d) => d.date),
      });
    }
  }

  if (impact) {
    // 서리로 이미 경고한 날은 빼고 센다 — 같은 날을 두 장으로 말하지 않는다.
    const coldDays = forecast.days.filter(
      (d) =>
        d.tempMin != null &&
        d.tempMin < impact.baseTempC &&
        d.tempMin > FROST_THRESHOLD_C,
    );
    if (coldDays.length > 0) {
      alerts.push({
        id: "cold",
        tone: "caution",
        titleKo: `생육 정지 ${coldDays.length}일 — ${impact.cropNameKo} 기준온도 ${impact.baseTempC}℃ 미만`,
        bodyKo: `${joinDates(coldDays.map((d) => d.date))}. 적산온도가 거의 안 쌓여 수확이 뒤로 밀립니다.`,
        dates: coldDays.map((d) => d.date),
      });
    }
  }

  // 관수는 **지난 실측**으로 본다. 필요량이나 관측이 없으면 판정을 보류한다.
  if (
    impact?.waterNeedMm != null &&
    forecast.rainfall7d != null &&
    forecast.rainfall7d < impact.waterNeedMm
  ) {
    const stage = impact.stageName ? `${impact.stageName} ` : "";
    const short = (impact.waterNeedMm - forecast.rainfall7d).toFixed(1);
    alerts.push({
      id: "water",
      tone: "info",
      titleKo: `관수 권장 — ${short}mm 부족`,
      bodyKo: `최근 7일 강수 ${forecast.rainfall7d}mm. ${stage}단계 필요량은 ${impact.waterNeedMm}mm 입니다.`,
      dates: [],
    });
  }

  return alerts;
}
