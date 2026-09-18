import "server-only";

import { nearestStation } from "@/shared/geo/nearestStation";
import { listStations } from "@/shared/geo/stationStore";
import {
  type ArrivalForecast,
  type ArrivalRule,
  forecastArrival_1,
  forecastArrival_2,
  type MonthlyNormal,
} from "@/shared/growth/forecast";
import { type DailyTemp, recentDailyGdd } from "@/shared/growth/gdd";
import {
  recommendTasks_2,
  type TaskAdvice,
  type TaskRule,
  type TaskWeather,
} from "@/shared/growth/taskAdvice";
import { getCultivationCard } from "./cultivationStore";
import type { CultivationCard } from "./domain/cultivationCard";
import {
  buildGrowthGauge,
  type GrowthGauge,
  type StageRow,
} from "./domain/growthGauge";
import {
  buildHarvestSummary,
  type HarvestSummary,
} from "./domain/harvestSummary";
import {
  type RebaseRule,
  rebaseGdd_1,
  type StageOverride,
} from "./domain/stageOverride";
import { buildStageTimeline, type StageStep } from "./domain/stageTimeline";
import { buildTimeline, type TimelineEntry } from "./domain/timeline";
import { listCultivationEvents } from "./eventStore";
import {
  listMonthlyNormals,
  listObservations,
  listStages,
} from "./growthStore";

/**
 * ---------------------------------------------
 * [Feature]: 재배 상세 화면이 읽는 값 한 벌 (서버 전용)
 *
 * [Description]
 * - 상세 화면 하나가 게이지·단계 타임라인·추천 작업·도달 예측·기록 타임라인·종료
 *   요약을 같이 그린다. 컴포넌트마다 조회하면 같은 관측을 여섯 번 읽으므로
 *   여기서 한 번에 모아 내려보낸다.
 * - **규칙 변형(`_1`/`_2`)을 고르는 자리가 이 파일이다.** 아래 세 상수의 오른쪽만
 *   바꾸면 화면 전체가 그 규칙으로 돈다. 고르고 나면 진 쪽 함수는 지운다 —
 *   남겨 두면 다음 사람이 어느 쪽이 도는지 코드에서 알 수 없다.
 * - 도달 예측은 **평년값이 있으면 `_2`, 없으면 `_1`** 이다(2026-09-18). 시금치를 9/1 에
 *   심은 밭이 `_1`(최근 7일 평균 반복)로 "수확 10/23" 을 냈는데, 평년으로 하루씩 쌓으면
 *   11/19 다 — 가을엔 하루 GDD 가 9월 17 → 10월 11 → 11월 5 로 떨어지는데 `_1` 은 9월
 *   속도가 계속된다고 본다. `normals` 표(관측소 176곳)가 생겨 `_2` 를 쓸 수 있게 됐다.
 *   다만 밭 관측소 109곳 중 24곳(공항·신설)은 평년값이 없어 그 밭은 `_1` 로 남는다.
 * - 소유 확인은 `getCultivationCard(plotId, ...)` 가 밭 id 를 같이 걸어서 한다.
 * ---------------------------------------------
 */

/** ── 규칙 선택 ─────────────────────────────────────────────── */

/**
 * 평년값이 있으면 `_2`(예보 밖을 그 달 평년으로 메움), 없으면 `_1`(최근 평균 반복).
 * "고르고 나면 진 쪽을 지운다" 는 이 파일 규칙의 예외다 — 둘 다 진 게 아니라,
 * 평년값 없는 관측소 24곳이 있는 동안 `_1` 이 그쪽의 유일한 답이다.
 */
function arrivalRuleFor(normals: readonly MonthlyNormal[]): ArrivalRule {
  return normals.length > 0 ? forecastArrival_2 : forecastArrival_1;
}

/** `recommendTasks_1` 은 단계만 본다. 기상 경고를 같이 내려면 `_2`. */
const TASK_RULE: TaskRule = recommendTasks_2;

/** `rebaseGdd_2` 는 보정 전 오차를 유지한다. `_1` 은 보정일을 새 출발선으로 본다. */
const REBASE_RULE: RebaseRule = rebaseGdd_1;

/** 도달 예측을 며칠까지 내다볼지. 이 밖은 "예측 못 함"으로 둔다. */
const HORIZON_DAYS = 120;

/** 최근 기온 평균을 낼 때 보는 기간. `growthGauge` 와 같은 값이다. */
const RECENT_WINDOW_DAYS = 7;

/** ── 반환 모양 ─────────────────────────────────────────────── */

export interface NextStageForecast {
  stageNameKo: string;
  forecast: ArrivalForecast;
}

export interface CultivationDetail {
  card: CultivationCard;
  stages: readonly StageRow[];
  gauge: GrowthGauge | null;
  stageSteps: readonly StageStep[];
  tasks: readonly TaskAdvice[];
  /** 다음 단계 도달 예측. 마지막 단계거나 못 맞히면 null. */
  nextStage: NextStageForecast | null;
  /** 수확 도달 예측. 이미 끝난 재배면 null. */
  harvest: ArrivalForecast | null;
  entries: readonly TimelineEntry[];
  /** 끝난 재배의 요약. 아직 진행 중이면 null. */
  summary: HarvestSummary | null;
  /** 이 밭 대신 읽은 관측소. */
  stationNameKo: string | null;
  today: string;
}

/** 단계 보정 이벤트 중 가장 나중 것. 여러 번 고쳐도 마지막 뜻만 남는다. */
function latestOverride(
  entries: readonly {
    kind: string;
    occurredOn: string;
    stageOrder: number | null;
  }[],
): StageOverride | null {
  const sets = entries.filter(
    (entry) => entry.kind === "STAGE_SET" && entry.stageOrder !== null,
  );
  if (sets.length === 0) return null;

  const latest = sets.reduce((a, b) => (a.occurredOn >= b.occurredOn ? a : b));
  return {
    stageOrder: latest.stageOrder as number,
    occurredOn: latest.occurredOn,
  };
}

/** 가장 **먼저** 내놓은 수확 예측일. 오차 계산의 기준이다. */
function firstForecastOn(
  entries: readonly { kind: string; forecastOn: string | null }[],
): string | null {
  const dates = entries
    .filter((entry) => entry.kind === "FORECAST")
    .map((entry) => entry.forecastOn)
    .filter((date): date is string => date !== null);
  if (dates.length === 0) return null;
  return dates.reduce((min, date) => (date < min ? date : min));
}

/**
 * 재배 한 건의 상세. 없거나 남의 밭이면 null.
 *
 * `today` 를 인자로 받는다 — 여기서 `Date.now()` 를 읽으면 같은 요청 안에서도
 * 자정을 넘기며 값이 갈리고, 테스트에서 고정할 수가 없다.
 */
export async function loadCultivationDetail(
  plot: { id: string; latitude: number; longitude: number },
  cultivationId: string,
  today: string,
  /**
   * 최근 기상 요약. 추천 작업의 기상 판정이 이걸 본다.
   *
   * 여기서 직접 읽지 않는 이유는 그 조회가 `features/monitoring` 에 있고
   * features 끼리는 import 할 수 없어서다(AGENTS.md). 페이지가 둘을 합친다 —
   * `plotStrip.ts` 가 생육단계를 인자로 받는 것과 같은 이유다.
   */
  weather: TaskWeather | null = null,
): Promise<CultivationDetail | null> {
  const card = await getCultivationCard(plot.id, cultivationId);
  if (card === null) return null;

  const [events, station, stagesByVariant] = await Promise.all([
    listCultivationEvents(card.id),
    listStations().then((stations) => nearestStation(plot, stations)),
    listStages([card.variantId]),
  ]);
  const stages = stagesByVariant.get(card.variantId) ?? [];

  // 관측은 파종일부터 읽는다. 단계 보정이 더 뒤를 가리켜도 앞 구간이 있어야
  // "보정 전에는 어땠나"를 그릴 수 있다.
  const [observations, normals]: [DailyTemp[], MonthlyNormal[]] =
    station === null || card.sowingDate === null
      ? [[], []]
      : await Promise.all([
          listObservations(station.stationCode, card.sowingDate),
          // 같은 관측소의 월별 평년값. 없으면 빈 배열 → 아래서 _1 로 내려간다
          listMonthlyNormals(station.stationCode),
        ]);

  const override = latestOverride(events);
  const rebase =
    override === null || card.baseTempC === null
      ? null
      : REBASE_RULE({
          override,
          stages,
          originalBaseGdd: 0,
          originalFrom: card.sowingDate,
          observations,
          baseTempC: card.baseTempC,
          upperTempC: card.upperTempC,
        });

  const gauge =
    card.gddTarget === null || card.baseTempC === null || stages.length === 0
      ? null
      : buildGrowthGauge({
          sowingDate: card.sowingDate,
          startStageOrder: card.startStageOrder,
          baseTempC: card.baseTempC,
          upperTempC: card.upperTempC,
          gddTarget: card.gddTarget,
          stages,
          observations,
          today,
          rebase: rebase?.applied ? rebase : null,
        });

  const perDayGdd =
    card.baseTempC === null
      ? 0
      : recentDailyGdd(
          observations,
          RECENT_WINDOW_DAYS,
          card.baseTempC,
          card.upperTempC ?? undefined,
        );

  const stageSteps =
    gauge === null || card.baseTempC === null
      ? []
      : buildStageTimeline({
          stages,
          sowingDate: rebase?.applied ? rebase.accumulateFrom : card.sowingDate,
          startGdd: rebase?.applied ? rebase.baseGdd : 0,
          accumulatedGdd: gauge.accumulatedGdd,
          observations,
          baseTempC: card.baseTempC,
          upperTempC: card.upperTempC,
          perDayGdd,
          today,
        });

  const recent = observations.slice(-RECENT_WINDOW_DAYS);
  const arrival = (targetGdd: number): ArrivalForecast | null => {
    if (gauge === null || card.baseTempC === null) return null;
    return arrivalRuleFor(normals)({
      accumulatedGdd: gauge.accumulatedGdd,
      targetGdd,
      baseTempC: card.baseTempC,
      upperTempC: card.upperTempC,
      // 예보를 적재하는 코드가 아직 없다. 빈 배열이면 규칙이 전 구간을 메운다.
      forecast: [],
      recent,
      normals,
      today,
      horizonDays: HORIZON_DAYS,
    });
  };

  const ended = card.status === "HARVESTED" || card.status === "FAILED";
  const current = gauge?.stage ?? null;
  const nextStage =
    ended || current === null
      ? null
      : (() => {
          const forecast = arrival(current.gddTo);
          if (forecast === null) return null;
          const next = stages.find(
            (s) => s.stageOrder === current.stageOrder + 1,
          );
          return { stageNameKo: next?.stageNameKo ?? "수확기", forecast };
        })();

  const entries = buildTimeline({
    cultivation: {
      id: card.id,
      cropKo: card.aliasKo ?? card.cropNameKo ?? "이름 없는 작물",
      sowingDate: card.sowingDate,
      sowingType: card.sowingType,
      harvestedAt: card.harvestedAt,
      failedAt: card.failedAt,
      failureReason: card.failureReason,
    },
    events,
  });

  return {
    card,
    stages,
    gauge,
    stageSteps,
    tasks: TASK_RULE({
      stageNameKo: gauge?.stage?.stageNameKo ?? null,
      weather,
    }),
    nextStage,
    harvest: ended || card.gddTarget === null ? null : arrival(card.gddTarget),
    entries,
    summary:
      card.baseTempC === null
        ? null
        : buildHarvestSummary({
            sowingDate: card.sowingDate,
            harvestedAt: card.harvestedAt,
            failedAt: card.failedAt,
            startGdd: rebase?.applied ? rebase.baseGdd : 0,
            observations,
            baseTempC: card.baseTempC,
            upperTempC: card.upperTempC,
            firstForecastOn: firstForecastOn(events),
          }),
    stationNameKo: station?.nameKo ?? null,
    today,
  };
}
