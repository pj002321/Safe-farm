import { accumulateGdd, type DailyTemp, roundTenth } from "@/shared/growth/gdd";
import type { StageRow } from "./growthGauge";

/**
 * ---------------------------------------------
 * [Feature]: 생육단계 수동 보정 → GDD 기준점 재설정 (순수)
 *
 * [Description]
 * - 사용자가 밭에 나가 보고 "이건 개화기가 아니라 착과기다" 라고 고칠 때, 그
 *   한마디를 GDD 계산에 되먹이는 계산이다. 화면 표시만 바꾸면 다음 날 게이지가
 *   원래 단계로 되돌아간다.
 * - **관측을 고치지 않는다.** 기상 관측은 사실이고 보정은 사용자의 관찰이다.
 *   시작점(`baseGdd`)과 적산 구간(`accumulateFrom`)만 바꿔서 둘을 섞지 않는다.
 * - 재설정 방식이 정해지지 않아 `rebaseGdd_1` · `_2` 두 벌을 둔다. 둘 다
 *   `RebaseRule` 이라 호출부 한 줄로 갈아 끼워진다.
 * - 보정 이력은 `cultivation_events` 의 `STAGE_SET` 행으로 남는다. 가장 최근
 *   한 건만 쓴다 — 여러 번 고쳤다면 마지막 관찰이 가장 정확하다.
 *
 * [Usage]
 * ```ts
 * const REBASE_RULE: RebaseRule = rebaseGdd_1;
 * const { baseGdd, accumulateFrom } = REBASE_RULE({ override, stages, ... });
 * ```
 * ---------------------------------------------
 */

/** `cultivation_events` 의 `STAGE_SET` 한 건을 좁힌 것. */
export interface StageOverride {
  /** 사용자가 지목한 `crop_stages.stage_order`. */
  stageOrder: number;
  /** 그렇게 관찰한 날 (`"YYYY-MM-DD"`). */
  occurredOn: string;
}

export interface RebaseInput {
  /** 가장 최근 보정. 없으면 null — 이때 두 변형 모두 원래 값을 그대로 돌려준다. */
  override: StageOverride | null;
  stages: readonly StageRow[];
  /** 보정이 없을 때의 적산 시작 GDD (`startStageOrder` 에서 나온 값). */
  originalBaseGdd: number;
  /** 보정이 없을 때의 적산 시작일. 파종일을 모르면 null. */
  originalFrom: string | null;
  observations: readonly DailyTemp[];
  baseTempC: number;
  upperTempC: number | null;
}

export interface RebaseResult {
  /** 적산을 시작할 GDD. */
  baseGdd: number;
  /** 이 날짜 이후 관측만 더한다. null 이면 관측을 더하지 않는다. */
  accumulateFrom: string | null;
  /** 보정이 실제로 적용됐나. 화면이 "직접 보정함" 꼬리표를 붙인다. */
  applied: boolean;
}

/** 두 변형이 공유하는 모양. 호출부는 이 타입으로만 붙잡는다. */
export type RebaseRule = (input: RebaseInput) => RebaseResult;

/** 보정이 없거나 쓸 수 없을 때의 답. 두 변형이 같은 값을 내야 해서 한 곳에 둔다. */
function untouched(input: RebaseInput): RebaseResult {
  return {
    baseGdd: input.originalBaseGdd,
    accumulateFrom: input.originalFrom,
    applied: false,
  };
}

/**
 * 보정이 가리키는 단계. 품종을 바꾸면 없는 단계가 될 수 있어 여기서 걸러 낸다
 * (마이그레이션에서 복합 FK 를 걸지 않은 이유이기도 하다).
 */
function overriddenStage(input: RebaseInput): StageRow | null {
  if (input.override === null) return null;
  return (
    input.stages.find((s) => s.stageOrder === input.override?.stageOrder) ??
    null
  );
}

/**
 * **변형 1 — 보정일을 새 출발선으로 삼는다.**
 *
 * 지목한 단계의 `gddFrom` 에서 시작해 **보정일 이후 관측만** 쌓는다. 그 이전의
 * 계산은 통째로 버린다.
 *
 * 사용자가 말한 그 날의 단계가 정확히 재현된다는 게 장점이다. 파종일을 잘못
 * 적었거나 모종 상태를 잘못 골랐을 때 한 번에 바로잡힌다.
 *
 * 대신 보정 전 구간의 관측이 결과에서 사라진다. 사용자가 "어제 개화기였다"고
 * 잘못 눌렀다면 그때까지 쌓인 값이 되돌아오지 않는다.
 */
export const rebaseGdd_1: RebaseRule = (input) => {
  const stage = overriddenStage(input);
  if (input.override === null || stage === null) return untouched(input);

  return {
    baseGdd: stage.gddFrom,
    accumulateFrom: input.override.occurredOn,
    applied: true,
  };
};

/**
 * **변형 2 — 어긋난 만큼 전 구간을 평행이동한다.**
 *
 * 보정일 시점의 계산값과 지목한 단계의 `gddFrom` 차이를 오프셋으로 잡고, 원래
 * 적산에 그 값을 더한다. 적산 구간은 파종일 그대로다.
 *
 * 보정 이후의 관측도 계속 쌓이므로 하루 단위 변화가 끊기지 않는다. 사용자가
 * 한 번 잘못 눌러도 이후 누적이 정상적으로 이어진다.
 *
 * 오프셋이 음수일 수 있다 — 계산이 실제보다 앞서 있었다는 뜻이다. 그대로 두면
 * 누적이 음수로 내려갈 수 있어 게이지가 0 에서 막는다.
 */
export const rebaseGdd_2: RebaseRule = (input) => {
  const stage = overriddenStage(input);
  if (input.override === null || stage === null) return untouched(input);

  // 보정일까지 원래 방식으로 쌓았을 때의 값.
  const grownUntilOverride =
    input.originalFrom === null
      ? 0
      : accumulateGdd(
          input.observations.filter(
            (row) => row.date <= (input.override?.occurredOn ?? ""),
          ),
          input.originalFrom,
          input.baseTempC,
          input.upperTempC ?? undefined,
        );

  const computed = input.originalBaseGdd + grownUntilOverride;

  return {
    baseGdd: roundTenth(input.originalBaseGdd + (stage.gddFrom - computed)),
    accumulateFrom: input.originalFrom,
    applied: true,
  };
};
