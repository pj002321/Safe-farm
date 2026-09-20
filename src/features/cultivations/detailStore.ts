import "server-only";

import { aiService } from "@/shared/aiService/client";
import { stationsByDistance } from "@/shared/geo/nearestStation";
import { listStations } from "@/shared/geo/stationStore";
import {
  type ArrivalForecast,
  type ArrivalRule,
  forecastArrival_2,
} from "@/shared/growth/forecast";
import {
  buildFruitCycle,
  type FruitCycle,
  fruitOriginDate,
} from "@/shared/growth/fruitOrigin";
import { type DailyTemp, recentDailyGdd } from "@/shared/growth/gdd";
import { listMonthlyNormals } from "@/shared/growth/normalStore";
import type { TaskAdvice } from "@/shared/growth/taskAdvice";
import { getCultivationCard } from "./cultivationStore";
import { type TaskReason, toTaskAdvices } from "./domain/aiTasks";
import type { CultivationCard } from "./domain/cultivationCard";
import { hideDoneToday } from "./domain/doneTasks";
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
import {
  appendUserStages,
  buildStageTimeline,
  type StageStep,
  type UserStage,
} from "./domain/stageTimeline";
import { buildTimeline, type TimelineEntry } from "./domain/timeline";
import { listCultivationEvents } from "./eventStore";
import { listObservations, listStages } from "./growthStore";

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
 * - **할 일은 우리가 판정하지 않는다.** ai-service 가 홈 카드와 **같은 함수**로
 *   낸 것을 받아 온다(`/v1/tasks/cultivation`). 전에는 화면 쪽 규칙이 따로
 *   판정해서 임계값이 갈렸고, 실제로 반대되는 조언이 나갔다 — 추수 3주 전 물을
 *   뺀 논에 홈은 조용한데 상세가 "충분히 주기" 를 냈다.
 * - 도달 예측은 **예보 → 평년값** 순으로 메운다. 예보가 닿는 날은 예보 기온으로,
 *   그 밖은 그 달의 평년 기온으로 쌓는다(`forecastArrival_2`). 평년값은 밭에서
 *   가까운 관측소 것을 읽고, 없으면 다음으로 가까운 곳으로 물러선다.
 * - 소유 확인은 `getCultivationCard(plotId, ...)` 가 밭 id 를 같이 걸어서 한다.
 * ---------------------------------------------
 */

/** ── 규칙 선택 ─────────────────────────────────────────────── */

/**
 * `forecastArrival_1` 은 최근 기온이 계속된다고 본다. 계절이 바뀌는 구간에서
 * 도달일이 크게 어긋나 `_2`(평년값 외삽)로 간다.
 *
 * ⚠️ `_1` 을 아직 지우지 않았다. `normals` 가 비어 있는 환경에서는 `_2` 가
 *    "모른다"만 내놓으므로, 적재 상태를 확인하기 전까지 되돌릴 자리를 남긴다.
 */
const ARRIVAL_RULE: ArrivalRule = forecastArrival_2;

/** `rebaseGdd_2` 는 보정 전 오차를 유지한다. `_1` 은 보정일을 새 출발선으로 본다. */
const REBASE_RULE: RebaseRule = rebaseGdd_1;

/** 도달 예측을 며칠까지 내다볼지. 이 밖은 "예측 못 함"으로 둔다. */
const HORIZON_DAYS = 120;

/** 최근 기온 평균을 낼 때 보는 기간. `growthGauge` 와 같은 값이다. */
const RECENT_WINDOW_DAYS = 7;

/**
 * 평년값을 물어볼 관측소 수. 가까운 순으로 이만큼만 본다.
 *
 * 가장 가까운 곳에 평년값이 없을 수 있어 1 로는 부족하고(`normalStore.ts` 참고),
 * 전부 받아 오면 쓰지도 않을 관측소 몇천 행을 매 요청마다 읽는다.
 */
const NORMAL_STATION_CANDIDATES = 3;

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
  /** 할 일이 0장일 때 **왜** 인지. 화면이 그에 맞는 말을 고른다. */
  taskReason: TaskReason;
  /** 다음 단계 도달 예측. 마지막 단계거나 못 맞히면 null. */
  nextStage: NextStageForecast | null;
  /** 수확 도달 예측. 이미 끝난 재배면 null. */
  harvest: ArrivalForecast | null;
  entries: readonly TimelineEntry[];
  /** 끝난 재배의 요약. 아직 진행 중이면 null. */
  summary: HarvestSummary | null;
  /** 이 밭 대신 읽은 관측소. */
  stationNameKo: string | null;
  /**
   * 과수의 한 해 주기. **과수가 아니면 null** — 화면이 이 칸으로 갈래를 판다.
   *
   * ⚠ 이 칸이 있으면 `gauge.stage === null` 의 뜻이 달라진다. 한해살이에서는
   *   "자료가 없다" 이지만 과수에서는 `afterHarvest` 일 때 **"올해 수확이
   *   끝났다"** 이고 그건 정상이다.
   */
  fruit: FruitCycle | null;
  today: string;
}

/**
 * 이 재배의 오늘 할 일. **판정은 ai-service 가 한다**(홈 카드와 같은 함수).
 *
 * ⚠️ 못 받아도 던지지 않는다. 할 일만 비고 게이지·타임라인은 그대로 그려진다 —
 *    평년값 조회가 실패했을 때와 같은 판단이다. 화면 전체를 죽일 값이 아니다.
 *
 * ⚠️ **밭 단위 값을 보내지 않는다.** 물수지·위성·특보·병해충·관측강수는 서버가
 *    `plotId` 로 직접 읽는다. 여기서 보내면 남의 밭 값을 끼워 넣을 통로가 된다.
 */
async function loadTasks(
  plotId: string,
  variantId: number,
  gauge: GrowthGauge | null,
): Promise<{ tasks: readonly TaskAdvice[]; reason: TaskReason }> {
  // 단계를 못 세운 밭은 여기서 끝낸다. 서버를 불러 봐야 시기 규칙이 전부 꺼져
  // 0장이 오는데, 그 0장은 "할 일이 없다" 가 아니라 **모른다** 는 뜻이다.
  if (gauge?.stage == null) return { tasks: [], reason: "no-stage" };

  const result = await aiService.cultivationTasks({
    plotId,
    variantId,
    // 화면이 판정한 단계·누적을 그대로 넘긴다. 서버가 다시 계산하면 사용자가
    // 고친 단계 보정(rebase)을 몰라 화면과 다른 단계를 근거로 말한다.
    stageOrder: gauge.stage.stageOrder,
    accumulatedGdd: gauge.accumulatedGdd,
  });

  if (!result.ok) {
    console.error(
      "[cultivation] 할 일 조회 실패",
      result.reason,
      result.detail,
    );
    return { tasks: [], reason: "failed" };
  }
  return { tasks: toTaskAdvices(result.data.tasks), reason: "ok" };
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

/**
 * 사용자가 붙인 단계들. 이름이 빈 행은 뺀다 — 타임라인에 이름 없는 점이 생긴다.
 *
 * 정렬은 `appendUserStages` 가 날짜로 다시 한다. 여기서는 고르기만 한다.
 */
function userStages(
  entries: readonly {
    id: string;
    kind: string;
    occurredOn: string;
    body: string | null;
  }[],
): readonly UserStage[] {
  return entries.flatMap((entry) =>
    entry.kind === "STAGE_ADD" && entry.body !== null
      ? [
          {
            eventId: entry.id,
            nameKo: entry.body,
            occurredOn: entry.occurredOn,
          },
        ]
      : [],
  );
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
   * 내일부터의 예보 기온. 도달 예측이 이 구간을 먼저 쓰고, 그 밖을 평년값으로
   * 메운다. `weather` 와 같은 이유로 여기서 직접 읽지 않는다 — 예보 조회는
   * `features/monitoring` 에 있고 features 끼리는 import 할 수 없다.
   */
  forecast: readonly DailyTemp[] = [],
): Promise<CultivationDetail | null> {
  const card = await getCultivationCard(plot.id, cultivationId);
  if (card === null) return null;

  const [events, nearby, stagesByVariant] = await Promise.all([
    listCultivationEvents(card.id),
    listStations().then((stations) => stationsByDistance(plot, stations)),
    listStages([card.variantId]),
  ]);
  const stages = stagesByVariant.get(card.variantId) ?? [];
  // 관측은 가장 가까운 한 곳에서만 읽는다. 평년값은 그 곳에 없을 수 있어
  // 가까운 순으로 몇 곳을 후보로 넘긴다(`normalStore.ts` 참고).
  const station = nearby[0] ?? null;

  // 관측은 파종일부터 읽는다. 단계 보정이 더 뒤를 가리켜도 앞 구간이 있어야
  // "보정 전에는 어땠나"를 그릴 수 있다.
  const [observations, normals] = await Promise.all([
    station === null || card.sowingDate === null
      ? Promise.resolve<DailyTemp[]>([])
      : listObservations(station.stationCode, card.sowingDate),
    listMonthlyNormals(
      nearby
        .slice(0, NORMAL_STATION_CANDIDATES)
        .map((point) => point.stationCode),
    ).catch((error) => {
      // 평년값이 없으면 예보 끝에서 멈출 뿐, 게이지와 타임라인은 그대로다.
      // 화면 전체를 죽일 이유가 없다.
      console.error("[cultivation] 평년값 조회 실패", error);
      return [];
    }),
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

  // ★ 과수는 **그 해의 기점**에서 GDD 를 0으로 되감는다 — 2026-09-20
  //   (`교안_과수를_살린다.md`). 나무는 몇 해 전에 심어서 파종일부터 쌓으면
  //   여러 해치 열이 누적된다. 규칙은 `shared/growth/fruitOrigin.ts` 하나이고
  //   **파이썬의 `plot_growth.gdd_origin` 과 같아야 한다**(그쪽 머리말 참고).
  //
  //   ⚠ `rebase`(사용자 단계 보정)가 있으면 그쪽이 이긴다. 사람이 "지금 개화기다"
  //     라고 고쳐 준 것이 달력보다 정확하다.
  const 과수기점 = fruitOriginDate(card, today);
  const gauge =
    card.gddTarget === null || card.baseTempC === null || stages.length === 0
      ? null
      : buildGrowthGauge({
          sowingDate: 과수기점 ?? card.sowingDate,
          // ⚠ 과수에는 모종 보정을 얹지 않는다. 그건 "씨 대신 모종으로 시작했으니
          //   앞 단계를 건너뛴다" 는 뜻인데, 과수는 해마다 기점에서 0으로
          //   되감기므로 건너뛸 앞 단계가 없다(파이썬 `gdd_origin` 과 같은 판단).
          startStageOrder: 과수기점 === null ? card.startStageOrder : null,
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

  const masterSteps =
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

  // 사용자 단계는 **GDD 계산이 끝난 뒤** 붙인다. 구간이 없어 계산의 재료가 될 수
  // 없고, 마스터가 비어도(기준온도 없음 등) 사용자가 적은 것은 보여야 한다.
  const stageSteps = appendUserStages(masterSteps, userStages(events), today);

  const ended = card.status === "HARVESTED" || card.status === "FAILED";
  const recent = observations.slice(-RECENT_WINDOW_DAYS);
  const arrival = (targetGdd: number): ArrivalForecast | null => {
    if (gauge === null || card.baseTempC === null) return null;
    return ARRIVAL_RULE({
      accumulatedGdd: gauge.accumulatedGdd,
      targetGdd,
      baseTempC: card.baseTempC,
      upperTempC: card.upperTempC,
      forecast,
      recent,
      normals,
      today,
      horizonDays: HORIZON_DAYS,
    });
  };

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

  // 끝난 재배는 부르지 않는다. 화면이 이 칸 자체를 안 그리고(page.tsx 의
  // `!ended`), 수확한 밭에 대고 물수지·위성을 다시 읽을 이유도 없다.
  const ai = ended
    ? { tasks: [] as readonly TaskAdvice[], reason: "ok" as TaskReason }
    : await loadTasks(plot.id, card.variantId, gauge);

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
    // 과수의 한 해 주기. 게이지 뒤에 만든다 — 누적이 목표를 넘었는지를 봐야
    // `afterHarvest` 를 가릴 수 있다
    fruit: buildFruitCycle(
      card,
      today,
      gauge?.accumulatedGdd ?? null,
      card.gddTarget,
    ),
    gauge,
    stageSteps,
    // 오늘 이미 `했음` 을 누른 카드는 뺀다. 규칙이 만든 계산값이라 id 가 없어
    // 제목으로 견준다 — 그날치만 본다(`domain/doneTasks.ts`).
    // ai-service 가 죽어도 화면 전체를 죽이지 않는다. 할 일만 비고 게이지·
    // 타임라인은 그대로다 — 평년값 조회 실패와 같은 판단이다.
    tasks: hideDoneToday(ai.tasks, entries, today),
    taskReason: ai.reason,
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
