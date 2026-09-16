import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import {
  type CultivationCard,
  type CultivationCardRow,
  sortCultivationCards,
  toCultivationCard,
} from "./domain/cultivationCard";

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

  const { error } = await supabase.from("cultivations").insert(
    inputs.map((input) => ({
      plot_id: plotId,
      variant_id: input.variantId,
      status: input.status,
      sowing_date: input.sowingDate,
      sowing_type: input.sowingType,
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
  start_stage_order, harvested_at, created_at,
  crop_variants(
    maturity_type, gdd_target, days_to_harvest,
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
    .eq("plot_id", plotId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as CultivationCardRow[];
  return sortCultivationCards(rows.map(toCultivationCard));
}

/**
 * 수확 완료로 바꾼다.
 *
 * 행을 지우지 않는다 — "언제 무엇을 거뒀나"가 다음 시즌의 자료다. 상태만 바뀌고
 * 파종일·품종은 그대로 남으므로 지난 기록 화면이 그대로 읽어 간다.
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
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}

/**
 * 재배 한 건을 지운다. 되돌릴 수 없다.
 *
 * 수확한 기록까지 지우려는 게 아니다 — 끝난 재배는 `markHarvested` 로
 * `HARVESTED` 가 되어 남는다. 이쪽은 **잘못 등록한 건을 정정**하는 길이다.
 * 그래서 `deleted_at` 을 두지 않는다. 숨겨 두면 모든 읽기 경로에 필터가 붙는
 * 대신 사용자가 다시 볼 일은 없다.
 */
export async function deleteCultivation(
  plotId: string,
  cultivationId: string,
): Promise<void> {
  if (!cultivationId) throw new Error("CULTIVATION_NOT_FOUND");

  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .delete()
    .eq("id", cultivationId)
    .eq("plot_id", plotId)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}
