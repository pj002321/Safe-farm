import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import {
  type CultivationCard,
  type CultivationCardRow,
  sortCultivationCards,
  toCultivationCard,
} from "./domain/cultivationCard";
import type { FailureReasonCode } from "./domain/failureReason";
import { seedlingStartStage } from "./domain/seedlingStart";

/**
 * ---------------------------------------------
 * [Feature]: 재배(작물 심기) 저장 (서버 전용)
 *
 * [Description]
 * - `cultivations` 한 행 = 이 밭에 이 품종을 이 날 심었다. 밭(`plots`)과 나눈
 *   이유는 한 밭에 배추를 8월에, 무를 9월에 심을 수 있어서다.
 * - 누적 GDD 컬럼은 없다. 볼 때마다 `weather_obs_daily` 를 읽어 다시 합산한다 —
 *   저장해 두면 기상 관측이 정정됐을 때 원천과 어긋난다.
 * - RLS 는 `plots.user_id` 를 타고 걸린다. 남의 밭 id 를 넣으면 정책이 막아
 *   insert 가 실패한다 — 여기서 소유자를 다시 확인하지 않는 이유다.
 * - 아직 심지 않은 밭은 `PLANNED` 로 넣는다. 기본값 `GROWING` 으로 두면
 *   `ck_cultivations_gdd_origin` 이 파종일이나 시작 단계를 요구해 insert 가
 *   막힌다 — 심기 전에는 적산을 시작할 지점이 없는 게 정상이다.
 * - 모종(`SEEDLING`)은 `start_stage_order` 를 같이 넣는다. 육묘장에서 이미 먹고 온
 *   GDD 만큼을 건너뛰지 않으면 심은 날 화면이 "발아기" 라고 한다(V1-20).
 *   어느 단계인지 고르는 규칙은 `domain/seedlingStart.ts` 다.
 * ---------------------------------------------
 */

export interface CultivationInput {
  variantId: number;
  /** `PLANNED` 면 sowingDate 는 심을 예정일이거나 null 이다. */
  status: "PLANNED" | "GROWING";
  sowingDate: string | null;
  /** 씨앗부터인지 모종부터인지. 모종은 육묘장에서 이미 GDD 를 먹고 온다. */
  sowingType: "SEED" | "SEEDLING";
}

/**
 * 밭 하나에 재배 여러 건을 한 번에 넣는다.
 *
 * 등록 폼이 작물을 복수 선택으로 받아 호출이 여러 건이 된다. 한 번의 insert 로
 * 보내야 일부만 들어가고 끊기는 상태가 안 생긴다.
 */
export async function insertCultivations(
  plotId: string,
  inputs: readonly CultivationInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const supabase = await getSupabaseServer();

  // 모종이면 어느 단계부터 쌓나. variant 마다 crop_stages 를 한 번씩만 본다 —
  // 한 밭에 고르는 작물 수만큼이라 왕복이 적고, 같은 품종을 둘 고르면 한 번으로 끝난다
  const startByVariant = new Map<number, number | null>();
  for (const input of inputs) {
    if (input.sowingType !== "SEEDLING" || startByVariant.has(input.variantId))
      continue;
    const { data: stages, error: stageError } = await supabase
      .from("crop_stages")
      .select("stage_order, stage_name, gdd_from, gdd_to") // 비율 판정에 끝값이 필요하다
      .eq("variant_id", input.variantId);
    if (stageError) throw new Error(stageError.message);
    startByVariant.set(input.variantId, seedlingStartStage(stages ?? []));
  }

  const { error } = await supabase.from("cultivations").insert(
    inputs.map((input) => ({
      plot_id: plotId,
      variant_id: input.variantId,
      status: input.status,
      sowing_date: input.sowingDate,
      sowing_type: input.sowingType,
      // 씨앗은 null(0 부터). 모종은 이식 단계. 표가 의심스러우면 null — domain/seedlingStart.ts
      start_stage_order:
        input.sowingType === "SEEDLING"
          ? (startByVariant.get(input.variantId) ?? null)
          : null,
    })),
  );

  if (error) throw new Error(error.message);
}

/**
 * 밭 상세의 작물 카드가 읽는 컬럼.
 *
 * `crop_variants → crops` 까지 타고 내려가는 이유는 이름이 작물에 있고 목표
 * GDD 는 품종에 있어서다. 둘 다 없으면 카드도 게이지도 못 그린다.
 */
const CARD_SELECT = `
  id, variant_id, alias, status, sowing_date, sowing_type,
  start_stage_order, harvested_at, failed_at, failure_reason, created_at,
  crop_variants(
    maturity_type, gdd_target, days_to_harvest,
    sow_method, sow_from, sow_to,
    crops(name, base_temp, upper_temp)
  )
`;

/**
 * 밭 하나에 심은 것 전부. 진행 중인 것이 위로 온다.
 *
 * `user_id` 를 받지 않는다 — `cultivations` 에는 그 컬럼이 없고, RLS 가
 * `plots` 를 경유해 소유자를 확인한다(마이그레이션의 `cultivations_select_own`).
 * 남의 밭 id 를 넣으면 오류가 아니라 **빈 배열**이 돌아온다. 호출자는 그 전에
 * `getPlot()` 으로 밭 자체를 확인하므로 여기서 다시 막지 않는다.
 */
export async function listCultivationCards(
  plotId: string,
): Promise<CultivationCard[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .select(CARD_SELECT)
    .eq("plot_id", plotId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as CultivationCardRow[];
  return sortCultivationCards(rows.map(toCultivationCard));
}

/**
 * 재배 한 건만 읽는다. 재배 상세 화면이 쓴다.
 *
 * `plot_id` 를 같이 거는 이유는 `markHarvested` 와 같다 — RLS 가 막지만 경로가
 * 가리키는 밭과 실제 소유가 어긋난 상태를 여기서 한 번 더 끊는다.
 * 없으면 던지지 않고 null 이다. 상세 화면은 이걸 받아 `notFound()` 를 부른다.
 */
export async function getCultivationCard(
  plotId: string,
  cultivationId: string,
): Promise<CultivationCard | null> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .select(CARD_SELECT)
    .eq("id", cultivationId)
    .eq("plot_id", plotId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return toCultivationCard(data as unknown as CultivationCardRow);
}

/**
 * 재배를 중단(실패) 처리한다.
 *
 * 수확과 나란한 종료다. 지우지 않는 이유도 같다 — "왜 망했나"가 다음 시즌에
 * 제일 쓸모 있는 기록이다. 사유 코드는 `failureReason.ts` 의 목록과
 * `ck_cultivations_failure_reason` 제약이 같은 값을 쓴다. 둘이 어긋나면 insert
 * 가 아니라 여기 update 가 제약에서 막힌다.
 *
 * 0건이면 던진다(`markHarvested` 와 같은 이유).
 */
export async function markFailed(
  plotId: string,
  cultivationId: string,
  failedAt: string,
  reason: FailureReasonCode,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .update({
      status: "FAILED",
      failed_at: failedAt,
      failure_reason: reason,
    })
    .eq("id", cultivationId)
    .eq("plot_id", plotId)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}

/**
 * 수확 완료로 바꾼다.
 *
 * 행을 지우지 않는다 — "언제 무엇을 거뒀나"가 다음 시즌의 자료다. 상태만 바뀌고
 * 파종일·품종은 그대로 남으므로 지난 기록 화면이 그대로 읽어 간다.
 *
 * 수확일은 **호출부가 정해 넘긴다**(`kstDateString()`). 여기서 `new Date()` 를
 * 읽으면 UTC 라 KST 00~09시에 누른 수확이 어제 날짜로 찍힌다 — GDD 게이지가
 * 이 날짜를 기준으로 잡으므로 하루가 통째로 어긋난다.
 *
 * `GROWING` 인 것만 겨냥한다 — 이미 수확했거나 실패 처리된 건을 다시 누르면
 * 0건으로 끝나 아래에서 던진다.
 *
 * `plot_id` 를 where 에 같이 넣는 이유는 `plotStore` 의 다른 함수들과 같다.
 * RLS 가 막지만, 정책이 한 번 헐거워졌을 때 조용히 남의 행을 고치지 않게 한다.
 *
 * 0건이면 던진다. update 는 조건에 맞는 행이 없어도 **오류가 아니라 0건으로
 * 조용히 끝나기** 때문이다 — 그대로 성공으로 넘기면 화면만 수확했다고 말한다.
 */
export async function markHarvested(
  plotId: string,
  cultivationId: string,
  harvestedAt: string,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .update({ status: "HARVESTED", harvested_at: harvestedAt })
    .eq("id", cultivationId)
    .eq("plot_id", plotId)
    .eq("status", "GROWING")
    // 지운 재배를 수확 처리하면 숨긴 행이 되살아난 것처럼 보인다.
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}

/**
 * 재배 한 건을 숨긴다. 행은 남는다(soft delete).
 *
 * 수확한 기록까지 치우려는 게 아니다 — 끝난 재배는 `markHarvested` 로
 * `HARVESTED` 가 되어 목록에 남는다. 이쪽은 **잘못 등록한 건을 정정**하는 길이다.
 *
 * 이름이 `delete` 가 아닌 이유는 도는 쿼리가 update 라서다(`softDeletePlot` 과
 * 같은 이유). 행을 실제로 지우지 않는 근거는
 * `20260917000000_soft_delete.sql` 에 적었다.
 *
 * 0건이면 던진다. update 는 조건에 맞는 행이 없어도 오류가 아니라 0건으로 끝나,
 * 그대로 넘기면 화면만 지워진 것처럼 보인다.
 */
export async function softDeleteCultivation(
  plotId: string,
  cultivationId: string,
): Promise<void> {
  if (!cultivationId) throw new Error("CULTIVATION_NOT_FOUND");

  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", cultivationId)
    .eq("plot_id", plotId)
    // 두 번 지우면 시각이 덮어써져 "언제 지웠나"가 틀어진다.
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}

/**
 * 파종일(또는 "아직 안 심었어요")을 고친다.
 *
 * 등록·작물 추가 때 잘못 적거나 비워 둔 파종일을 나중에 고칠 방법이 없었다
 * — 이 값이 GDD 적산의 기준점이라 틀리면 생육 단계·오늘 할 일 판정 전체가
 * 어긋난다. 수확·실패 처리된 건은 화면(`plots/[id]/page.tsx`)에서 애초에
 * 수정 칸을 보여주지 않는다 — 여기서는 막지 않는다.
 *
 * where 조건은 이 파일의 다른 update 들과 같다 — `plot_id` 로 한 번 더 좁히고
 * (`markHarvested` 주석 참고), `deleted_at is null` 로 지운 재배를 뺀다. 지운
 * 재배의 파종일이 고쳐지면 되살렸을 때 실제와 다른 날짜가 들어 있게 된다.
 */
export async function updateCultivationSowing(
  plotId: string,
  cultivationId: string,
  input: { status: "PLANNED" | "GROWING"; sowingDate: string | null },
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .update({ status: input.status, sowing_date: input.sowingDate })
    .eq("id", cultivationId)
    .eq("plot_id", plotId)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}
