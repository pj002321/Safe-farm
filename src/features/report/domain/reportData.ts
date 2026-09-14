import {
  evaluateSprayHours,
  findWindows,
  SPRAY_LIMITS,
  SUN,
  TODAY_HOURLY,
  toMinutes,
} from "./drone";
import {
  accumulateGdd,
  daysToTarget,
  progressRatio,
  recentDailyGdd,
  roundTenth,
} from "./gdd";
import { evaluateHazards, type FiredHazard, HAZARD_RULES } from "./hazard";
import {
  GDD_BEFORE_WINDOW,
  RECENT_DAYS,
  rainfallOverLastDays,
  SOWING_DATE,
  STATION,
} from "./observations";

/**
 * ---------------------------------------------
 * [Feature]: 리포트 화면이 쓸 값 한 번에 조립
 *
 * [Description]
 * - 흩어진 순수 함수들의 결과를 화면이 바로 쓸 모양으로 묶는다. growthReport.ts 와
 *   같은 역할이되, 이쪽은 적산온도 기반 데모 전용이다.
 * - **컴포넌트에서 계산하지 않는다.** 화면 안에서 `accumulateGdd()` 를 부르면 같은
 *   숫자가 여러 컴포넌트에서 따로 계산되고, 리렌더마다 다시 돈다. 무엇보다 그
 *   숫자가 맞는지 테스트할 자리가 사라진다.
 * - 모듈 최상위에서 한 번 계산해 상수로 둔다. 입력이 전부 고정 데이터라 매번
 *   같은 값이 나오고, `Date.now()` 를 쓰지 않으므로 언제 열어도 화면이 같다.
 *
 * [Usage]
 * ```ts
 * import { REPORT } from "@/features/report/domain/reportData";
 * REPORT.growth.accumulatedGdd;  // 384.2
 * ```
 * ---------------------------------------------
 */

/** 가을배추 기준값. 전부 농촌진흥청 작형표에서 온다. */
export const CABBAGE = {
  nameKo: "가을배추",
  baseTempC: 5,
  /** 씨뿌림 → 수확까지 총 적산온도 */
  totalTargetGdd: 797,
  /** 속이 차기 시작하는 지점 */
  headingTargetGdd: 505,
  /** 씨뿌린 뒤 오늘까지 며칠째인가 */
  daysSinceSowing: 20,
  plotNameKo: "배추밭",
  areaKo: "약 200평",
} as const;

/** 단감 적지 판정. 상주는 두 조건을 간신히 넘기는 북방 한계선이다. */
export const PERSIMMON_FIT = [
  {
    itemKo: "연평균기온",
    actual: "13.1℃",
    standard: "13.0℃ 이상",
    verdict: "marginal",
  },
  {
    itemKo: "일조시간",
    actual: "2,401h",
    standard: "2,340h 이상",
    verdict: "marginal",
  },
  {
    itemKo: "휴면기 최저",
    actual: "겨울에 확인",
    standard: "-4℃ 이상",
    verdict: "pending",
  },
  {
    itemKo: "10월 평균",
    actual: "확인 예정",
    standard: "15℃ 이상",
    verdict: "pending",
  },
] as const;

export type FitVerdict = (typeof PERSIMMON_FIT)[number]["verdict"];

const observedGdd = accumulateGdd(RECENT_DAYS, SOWING_DATE, CABBAGE.baseTempC);
const accumulatedGdd = roundTenth(observedGdd + GDD_BEFORE_WINDOW);
const perDayGdd = recentDailyGdd(RECENT_DAYS, 7, CABBAGE.baseTempC);
const rain7Mm = rainfallOverLastDays(RECENT_DAYS, 7);
const today = RECENT_DAYS[RECENT_DAYS.length - 1];

const hazards: FiredHazard[] = evaluateHazards(HAZARD_RULES, {
  rain7Mm,
  tempMaxC: today.tempMaxC,
  tempMinC: today.tempMinC,
  stageKo: "생육",
});

const sprayHours = evaluateSprayHours(TODAY_HOURLY, SPRAY_LIMITS, {
  sunriseMinutes: toMinutes(SUN.riseKo),
});

/**
 * 화면이 쓰는 값 전부.
 *
 * 문장(`adviceKo`)도 여기서 만든다. 숫자가 바뀌면 문장도 같이 바뀌어야 하는데,
 * 화면에 하드코딩해 두면 둘이 어긋나도 아무도 모른다.
 */
export const REPORT = {
  station: STATION,
  crop: CABBAGE,
  growth: {
    accumulatedGdd,
    perDayGdd,
    progress: progressRatio(accumulatedGdd, CABBAGE.totalTargetGdd),
    daysToHeading: daysToTarget(
      accumulatedGdd,
      perDayGdd,
      CABBAGE.headingTargetGdd,
    ),
    /** 게이지 위 눈금 위치(0~1). 결구 시작점이 전체 어디쯤인가. */
    headingMark: CABBAGE.headingTargetGdd / CABBAGE.totalTargetGdd,
  },
  weather: {
    rain7Mm,
    todayMinC: today.tempMinC,
    todayMaxC: today.tempMaxC,
    sunriseKo: SUN.riseKo,
    sunsetKo: SUN.setKo,
  },
  hazards,
  spray: {
    hours: sprayHours,
    windows: findWindows(sprayHours),
    limits: SPRAY_LIMITS,
  },
} as const;

/**
 * 마지막 단계에서 타이핑되는 문장.
 *
 * LLM 이 만드는 자리이지만, 데모에서는 **계산 결과로부터 결정적으로** 만든다.
 * 실제 연동 때 이 배열이 API 응답으로 바뀐다. 지금 하드코딩된 문자열을 두면
 * 숫자를 고쳤을 때 문장이 따라오지 않아 화면이 서로 다른 말을 한다.
 */
export function buildAdvice(): readonly {
  text: string;
  tone: "info" | "todo" | "warn";
}[] {
  const { growth, weather, hazards: fired } = REPORT;
  const lines: { text: string; tone: "info" | "todo" | "warn" }[] = [];

  const days = growth.daysToHeading;
  lines.push({
    tone: "info",
    text:
      days === null
        ? `배추가 자라고 있습니다. 지금 기온으로는 결구 시기를 가늠하기 어렵습니다.`
        : `배추가 잘 크고 있어요. 앞으로 ${days}일쯤 뒤면 속이 차기 시작합니다. 수확은 10월 중순쯤 될 것 같아요.`,
  });

  for (const hazard of fired) {
    lines.push({
      tone: "todo",
      text: `${hazard.nameKo} — ${hazard.becauseKo}. ${hazard.actionsKo[0]}부터 해보세요.`,
    });
    if (hazard.actionsKo[1]) {
      lines.push({
        tone: "todo",
        text: `${hazard.actionsKo[1]}도 함께 하시면 좋습니다.`,
      });
    }
  }

  lines.push({
    tone: "warn",
    text: `속이 차는 때는 더위에 약합니다. 낮 기온이 아직 ${weather.todayMaxC}℃를 넘고 있으니 며칠 더 살펴봐 주세요.`,
  });

  return lines;
}
