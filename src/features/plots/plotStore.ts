import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import type { PlotRegistrationInput } from "./domain/registerPlot";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 저장 (서버 전용)
 *
 * [Description]
 * - `registerPlot.ts` 는 값을 좁히기만 하는 순수 함수다. DB 를 실제로 만지는
 *   것은 여기다 — `profileStore.ts` 와 같은 나눔이다.
 * - 격자(nx, ny)는 호출자가 넘긴다. `features/monitoring` 의 계산 결과를
 *   여기서 다시 import 하면 features 끼리 참조하게 되어 규칙에 어긋난다.
 * - `getSupabaseServer()` 를 쓴다 — 로그인한 사용자 권한 그대로 insert 하므로
 *   `plots_insert_own` RLS 정책(`auth.uid() = user_id`)이 그대로 걸린다.
 * ---------------------------------------------
 */

export interface PlotGrid {
  gridX: number;
  gridY: number;
}

export async function insertPlot(
  userId: string,
  input: PlotRegistrationInput,
  grid: PlotGrid,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { error } = await supabase.from("plots").insert({
    user_id: userId,
    name: input.name,
    area_m2: input.areaM2,
    latitude: input.latitude,
    longitude: input.longitude,
    grid_x: grid.gridX,
    grid_y: grid.gridY,
    region_code: input.regionCode,
    region_ko: input.regionKo,
    address_ko: input.addressKo,
    crops: input.crops,
    sowing_date: input.sowingDate,
    sowing_unknown: input.sowingUnknown,
    sowing_method: input.sowingMethod,
  });

  if (error) throw error;
}
