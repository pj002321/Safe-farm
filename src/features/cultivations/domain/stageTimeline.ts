import { type DailyTemp, dailyGdd } from "@/shared/growth/gdd";
import type { StageRow } from "./growthGauge";

/**
 * ---------------------------------------------
 * [Feature]: 생육 타임라인 — 전 단계와 도달일 (순수)
 *
 * [Description]
 * - 게이지(`growthGauge.ts`)는 "지금 어디"만 말한다. 여기서는 **전체 단계를 줄로
 *   세우고** 지난 단계에는 언제 지났는지, 앞 단계에는 언제쯤인지를 붙인다.
 * - 도달일은 두 종류다. 지난 단계는 관측을 하루씩 쌓아 임계를 넘은 **실측일**,
 *   앞 단계는 최근 평균으로 민 **추정일**이다. 화면이 둘을 구분해 적는다 —
 *   섞어 놓으면 사용자가 추정일을 약속으로 읽는다.
 * - 관측이 비는 날은 0 으로 더해진다. 그래서 실측 도달일이 실제보다 늦게
 *   잡힐 수 있다. 그 사실은 게이지의 `coveredDays` 가 이미 말하고 있으므로
 *   여기서 또 경고하지 않는다.
 * - 한 화면에 여섯 단계가 다 펼쳐지면 길어서, 화면은 기본으로 접고 현재 단계
 *   앞뒤만 보인다.
 *
 * [Usage]
 * ```ts
 * const steps = buildStageTimeline({ stages, observations, ... });
 * steps.find((s) => s.state === "current")?.nameKo;   // "결구기"
 * ```
 * ---------------------------------------------
 */

export type StageState = "done" | "current" | "upcoming";

export interface StageStep {
  stageOrder: number;
  nameKo: string;
  guideKo: string | null;
  state: StageState;
  /** 이 단계가 시작된(또는 시작될) 날. 알 수 없으면 null. */
  reachedOn: string | null;
  /** 관측으로 확인한 날인지, 앞으로의 추정인지. `reachedOn` 이 null 이면 null. */
  reachedKind: "observed" | "estimated" | null;
}

export interface StageTimelineInput {
  /** 그 품종의 단계표. 순서는 여기서 맞춘다. */
  stages: readonly StageRow[];
  /** 적산 시작일. 모르면 null — 실측 도달일을 낼 수 없다. */
  sowingDate: string | null;
  /** 적산 시작 GDD (모종으로 시작했으면 0 이 아니다). */
  startGdd: number;
  /** 지금까지 쌓인 GDD. 게이지가 낸 값을 그대로 받는다. */
  accumulatedGdd: number;
  observations: readonly DailyTemp[];
  baseTempC: number;
  upperTempC: number | null;
  /** 앞 단계 추정에 쓸 하루 평균 GDD. 0 이면 추정하지 않는다. */
  perDayGdd: number;
  /** 오늘 (`"YYYY-MM-DD"`). 호출자가 넘긴다. */
  today: string;
}

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(stamp)) return date;
  return new Date(stamp + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * 관측을 하루씩 쌓아 각 임계를 처음 넘은 날을 찾는다.
 *
 * 임계마다 따로 훑지 않고 한 번에 지나가며 모은다 — 단계가 여섯이면 여섯 배로
 * 도는 것을 막는다.
 */
function observedCrossings(
  input: StageTimelineInput,
  thresholds: readonly number[],
): Map<number, string> {
  const found = new Map<number, string>();
  if (input.sowingDate === null) return found;

  const upper = input.upperTempC ?? undefined;
  const rows = input.observations
    .filter(
      (row) => row.date >= (input.sowingDate ?? "") && row.date <= input.today,
    )
    .toSorted((a, b) => a.date.localeCompare(b.date));

  let accumulated = input.startGdd;

  // 시작 시점에 이미 넘어 있는 임계는 파종일에 도달한 것으로 본다.
  for (const threshold of thresholds) {
    if (accumulated >= threshold) found.set(threshold, input.sowingDate);
  }

  for (const row of rows) {
    accumulated += dailyGdd(row.tempMaxC, row.tempMinC, input.baseTempC, upper);
    for (const threshold of thresholds) {
      if (!found.has(threshold) && accumulated >= threshold) {
        found.set(threshold, row.date);
      }
    }
  }

  return found;
}

/**
 * 전 단계를 줄로 세운다. 단계표가 비면 빈 배열.
 *
 * 마지막 단계의 `gddTo` 를 넘겼으면 `current` 가 없다 — 수확기를 지난 상태다.
 * 화면이 그때 "수확 시기"를 따로 말한다(게이지와 같은 처리).
 */
export function buildStageTimeline(
  input: StageTimelineInput,
): readonly StageStep[] {
  const stages = input.stages.toSorted((a, b) => a.stageOrder - b.stageOrder);
  if (stages.length === 0) return [];

  const crossings = observedCrossings(
    input,
    stages.map((stage) => stage.gddFrom),
  );

  return stages.map((stage) => {
    const passed = input.accumulatedGdd >= stage.gddTo;
    const current =
      input.accumulatedGdd >= stage.gddFrom &&
      input.accumulatedGdd < stage.gddTo;

    const observedOn = crossings.get(stage.gddFrom) ?? null;

    // 앞으로 올 단계는 남은 GDD 를 하루 평균으로 나눠 민다. 평균이 0 이면
    // 나눌 수 없어 날짜를 비운다 — 아무 날짜나 적으면 사용자가 그걸 믿는다.
    const estimatedOn =
      observedOn !== null || input.perDayGdd <= 0
        ? null
        : addDays(
            input.today,
            Math.max(
              0,
              Math.ceil(
                (stage.gddFrom - input.accumulatedGdd) / input.perDayGdd,
              ),
            ),
          );

    return {
      stageOrder: stage.stageOrder,
      nameKo: stage.stageNameKo,
      guideKo: stage.guideKo,
      state: passed ? "done" : current ? "current" : "upcoming",
      reachedOn: observedOn ?? estimatedOn,
      reachedKind:
        observedOn !== null
          ? "observed"
          : estimatedOn !== null
            ? "estimated"
            : null,
    };
  });
}
