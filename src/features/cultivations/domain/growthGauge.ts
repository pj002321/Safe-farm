import {
  accumulateGdd,
  type DailyTemp,
  daysToTarget,
  progressRatio,
  recentDailyGdd,
} from "@/shared/growth/gdd";

/**
 * ---------------------------------------------
 * [Feature]: 재배 한 건의 누적 GDD → 게이지 값 (순수)
 *
 * [Description]
 * - 밭 상세의 작물 카드가 그리는 막대 하나에 필요한 숫자를 전부 여기서 낸다.
 *   조회는 `cultivationStore.ts` 가, 그림은 컴포넌트가 맡는다.
 * - 단계 판정 규칙은 `ai-service/app/service/ask_context.py` 의
 *   `_growth_stage_lines` 와 **같아야 한다.** 화면의 "개화기"와 LLM 이 말하는
 *   "개화기"가 다르면 둘 중 하나는 거짓말이 된다. 구간은 반개구간이고
 *   (`gdd_from` 포함 · `gdd_to` 미포함), 모종으로 시작한 건은 0 이 아니라
 *   시작 단계의 `gdd_from` 부터 쌓는다.
 * - 누적값을 저장하지 않는다. 볼 때마다 관측을 다시 합산한다 — 기상 관측이
 *   정정됐을 때 저장해 둔 값은 원천과 어긋난다(cultivations 마이그레이션 주석).
 * - **관측이 모자란 상태를 숨기지 않는다.** 파종일부터 오늘까지 중 관측이 없는
 *   날은 0 으로 더해지는데, 그걸 그대로 보여주면 사용자는 작물이 안 자란 줄
 *   안다. `coveredDays` / `expectedDays` 를 같이 돌려주어 화면이 "관측 n일
 *   누락"을 말하게 한다.
 *
 * [Usage]
 * ```ts
 * const gauge = buildGrowthGauge({ ... });
 * gauge?.stage?.stageNameKo;   // "결구기"
 * gauge?.ratio;                // 0.48 — 게이지 채움
 * ```
 * ---------------------------------------------
 */

/** `crop_stages` 한 행. 화면이 쓰는 이름으로 좁힌 것. */
export interface StageRow {
  stageOrder: number;
  stageNameKo: string;
  /** 이 단계가 시작되는 누적 GDD. 이 값 포함. */
  gddFrom: number;
  /** 다음 단계가 시작되는 누적 GDD. 이 값 미포함. */
  gddTo: number;
  guideKo: string | null;
}

export interface GrowthGaugeInput {
  /** 없으면 언제부터 쌓을지가 없다. `startStageOrder` 만으로도 게이지는 그린다. */
  sowingDate: string | null;
  /** 모종으로 시작했을 때 적산을 시작할 단계. 씨부터면 null. */
  startStageOrder: number | null;
  baseTempC: number;
  /** 상한온도. 없는 작물이 있어 nullable 이다. */
  upperTempC: number | null;
  /** `crop_variants.gdd_target` — 수확까지 쌓아야 할 누적 GDD. */
  gddTarget: number;
  /** 그 품종의 단계표. 순서는 상관없다(여기서 찾아 쓴다). */
  stages: readonly StageRow[];
  /** 관측 일통계. `date` 는 `"YYYY-MM-DD"`. */
  observations: readonly DailyTemp[];
  /** 오늘 (`"YYYY-MM-DD"`). 호출자가 넘긴다 — 여기서 `Date.now()` 를 읽지 않는다. */
  today: string;
  /**
   * 단계 보정으로 옮긴 출발선. 없으면 `sowingDate` + `startStageOrder` 를 쓴다.
   *
   * 사용자가 "지금 개화기다"라고 고쳐 주면 적산을 그 지점에서 다시 시작한다.
   * 규칙 자체는 `stageOverride.ts` 의 `rebaseGdd_*` 가 정하고, 여기는 그 결과를
   * 받기만 한다 — 어느 규칙을 쓸지가 이 파일로 새면 게이지가 규칙마다 갈린다.
   */
  rebase?: { baseGdd: number; accumulateFrom: string | null } | null;
}

export interface GrowthGauge {
  /** 시작 GDD + 관측 적산. */
  accumulatedGdd: number;
  targetGdd: number;
  /** 0~1. 목표를 넘겨도 1 을 넘지 않는다. */
  ratio: number;
  /** 지금 단계. 단계표가 비었거나 누적이 마지막 구간을 넘었으면 null. */
  stage: StageRow | null;
  /** 다음 단계가 시작되는 지점의 진행률. 게이지 눈금. 단계를 모르면 null. */
  markRatio: number | null;
  /** 최근 기온으로 추정한 수확까지 남은 일수. 추정할 수 없으면 null. */
  daysLeft: number | null;
  /** 파종일~오늘 중 관측이 실제로 있는 날 수. */
  coveredDays: number;
  /** 그 구간에 있어야 할 날 수. `coveredDays` 와 다르면 누적이 실제보다 낮다. */
  expectedDays: number;
}

/** 남은 일수를 추정할 때 보는 기간. 계절이 바뀌는 중이라 한 해 평균을 쓰지 않는다. */
const RECENT_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * 적산을 시작할 GDD.
 *
 * 모종으로 시작했으면 0 이 아니다 — 그 모종은 육묘장에서 이미 어느 단계까지
 * 자란 상태로 밭에 들어왔다. 별도 상수를 두지 않고 그 단계의 `gddFrom` 을 쓴다.
 */
function startGdd(
  stages: readonly StageRow[],
  startStageOrder: number | null,
): number {
  if (startStageOrder === null) return 0;
  const stage = stages.find((s) => s.stageOrder === startStageOrder);
  return stage ? stage.gddFrom : 0;
}

/**
 * 누적 GDD 가 들어가는 단계.
 *
 * 마지막 단계의 `gddTo` 를 넘기면 null 이다. 이때는 수확기를 지난 것이라
 * 화면이 "수확 시기"라고 따로 말한다 — 마지막 단계에 붙여 두면 영영 그 단계에
 * 머문 것처럼 보인다.
 */
function stageAt(
  stages: readonly StageRow[],
  accumulated: number,
): StageRow | null {
  return (
    stages.find((s) => s.gddFrom <= accumulated && accumulated < s.gddTo) ??
    null
  );
}

/** 달력 날짜 사이의 일수. UTC 자정으로 고정해 서머타임에 흔들리지 않게 한다. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/**
 * 게이지 값 한 벌.
 *
 * 적산을 시작할 지점이 아예 없으면(파종일도 시작 단계도 없음) null 이다. 이건
 * `ck_cultivations_gdd_origin` 이 PLANNED 에만 허용하는 상태라, 화면은 "아직
 * 심지 않음"으로 읽으면 된다.
 */
export function buildGrowthGauge(input: GrowthGaugeInput): GrowthGauge | null {
  const { sowingDate, stages, observations, today } = input;
  if (sowingDate === null && input.startStageOrder === null) return null;

  const upper = input.upperTempC ?? undefined;
  const rebase = input.rebase ?? null;
  const base = rebase
    ? rebase.baseGdd
    : startGdd(stages, input.startStageOrder);
  const from = rebase ? rebase.accumulateFrom : sowingDate;

  // 적산을 시작할 날을 모르면 관측을 더할 구간이 없다. 시작 GDD 만으로 그린다.
  const grown =
    from === null
      ? 0
      : accumulateGdd(observations, from, input.baseTempC, upper);

  const accumulatedGdd = Math.round((base + grown) * 10) / 10;
  const stage = stageAt(stages, accumulatedGdd);

  const perDay = recentDailyGdd(
    observations,
    RECENT_WINDOW_DAYS,
    input.baseTempC,
    upper,
  );

  // 파종일~오늘 사이에 실제로 있는 관측 일수. 미래 예보가 섞여 들어와도 세지 않는다.
  const covered =
    from === null
      ? 0
      : observations.filter((row) => row.date >= from && row.date <= today)
          .length;

  return {
    accumulatedGdd,
    targetGdd: input.gddTarget,
    ratio: progressRatio(accumulatedGdd, input.gddTarget),
    stage,
    markRatio: stage ? progressRatio(stage.gddTo, input.gddTarget) : null,
    daysLeft: daysToTarget(accumulatedGdd, perDay, input.gddTarget),
    coveredDays: covered,
    // 파종일 당일도 한 날로 센다. 미래 날짜(PLANNED)면 0.
    expectedDays: from === null ? 0 : Math.max(0, daysBetween(from, today) + 1),
  };
}
