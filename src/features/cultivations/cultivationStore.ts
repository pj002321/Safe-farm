import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";

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
 * 재배 한 건을 수확 완료로 바꾼다.
 *
 * `GROWING` 인 것만 겨냥한다(`.eq("status", "GROWING")`) — 이미 수확했거나
 * 실패 처리된 건을 다시 누르면 0건으로 끝나 아래에서 던진다. 소유자 확인은
 * `insertCultivations` 와 같은 이유로 여기서 하지 않는다: RLS 가
 * `plots.user_id` 를 타고 막는다.
 */
export async function markHarvested(cultivationId: string): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .update({
      status: "HARVESTED",
      harvested_at: new Date().toISOString().slice(0, 10),
    })
    .eq("id", cultivationId)
    .eq("status", "GROWING")
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("CULTIVATION_NOT_FOUND");
}
