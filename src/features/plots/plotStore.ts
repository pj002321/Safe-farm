import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import type { PlotEditInput } from "./domain/editPlot";
import {
  type PlotCard,
  type PlotMapPoint,
  toPlotCard,
  toPlotMapPoint,
} from "./domain/plotSummary";
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

/**
 * 작물·파종일은 `cultivations` 에 있다. PostgREST 중첩 select 로 한 번에 끌어온다
 * — 밭 목록마다 재배를 따로 조회하면 N+1 이 된다.
 * `crop_variants → crops` 까지 타고 내려가는 이유는 이름이 작물(`crops.name`)에
 * 있고 품종에는 없어서다. `variant_id` 는 목표 GDD 와 단계표를 찾는 키라 이름과
 * 함께 들고 나온다.
 */

// 유사 join 쿼리
const CULTIVATION_SELECT =
  "cultivations(variant_id, sowing_date, crop_variants(crops(name)))";

export interface PlotGrid {
  gridX: number;
  gridY: number;
}

/**
 * 밭 한 행을 넣고 **id 를 돌려준다.**
 *
 * 작물·파종일은 여기 없다 — `cultivations` 로 옮겼다(한 밭에 여러 작물을 서로
 * 다른 날 심을 수 있다). 그래서 호출자가 이 id 로 재배 행을 이어 붙인다.
 */
export async function insertPlot(
  userId: string,
  input: PlotRegistrationInput,
  grid: PlotGrid,
): Promise<string> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id;
}

/**
 * 텃밭 정보 수정. 이름과 면적만 바꾼다.
 *
 * 위치(좌표·격자·행정동)는 여기서 손대지 않는다 — 격자가 바뀌면 그 격자로 쌓아
 * 온 관측 이력이 어긋나므로, 옮긴 밭은 새로 등록한다. 그래서 등록과 달리
 * 격자를 넘겨받지 않는다.
 * 남의 밭이면 RLS 가 걸러 **0행이 고쳐지고 오류는 나지 않는다.** 그래서
 * `select()` 로 고쳐진 행을 돌려받아 없으면 예외로 바꾼다 — 조용한 실패를 막는다.
 */
export async function updatePlot(
  userId: string,
  plotId: string,
  input: PlotEditInput,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .update({
      name: input.name,
      area_m2: input.areaM2,
    })
    .eq("id", plotId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("수정할 텃밭을 찾지 못했습니다.");
  }
}

/** 로그인한 사용자가 등록한 텃밭 좌표 목록. */
export async function listPlots(userId: string): Promise<PlotMapPoint[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select(`id, name, latitude, longitude, ${CULTIVATION_SELECT}`)
    // RLS가 자기 밭만 보이게 하지만, profileStore.ts처럼 where도 명시한다.
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  return (data ?? []).map(toPlotMapPoint);
}

/** 텃밭 하나(상세 화면용). 없거나 남의 밭이면 null. */
export async function getPlot(
  userId: string,
  plotId: string,
): Promise<PlotMapPoint | null> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select(`id, name, latitude, longitude, ${CULTIVATION_SELECT}`)
    .eq("user_id", userId)
    .eq("id", plotId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ? toPlotMapPoint(data) : null;
}

/**
 * 텃밭 목록(카드 화면용). 최근 등록이 앞에 온다.
 *
 * `listPlots()` 를 고치지 않고 따로 둔다 — 지도(map/page.tsx)가 그 반환 모양을
 * 쓰고 있어, 열을 늘리면 같이 흔들린다.
 * 개인 텃밭은 수가 적어 아직 페이징하지 않는다.
 */
export async function listPlotCards(userId: string): Promise<PlotCard[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select(`id, name, area_m2, region_ko, created_at, ${CULTIVATION_SELECT}`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(toPlotCard);
}
