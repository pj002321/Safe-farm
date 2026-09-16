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
  "cultivations(id, variant_id, sowing_date, status, crop_variants(crops(name)))";

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
 * 이 사용자가 등록한 밭 수.
 *
 * 로그인 직후 "온보딩으로 보낼지 홈으로 보낼지"를 정하는 데 쓴다. 행을 받아오지
 * 않고 개수만 센다(`head: true`) — 판단에 필요한 것은 0 인지 아닌지뿐이다.
 *
 * RLS 가 자기 행만 보이게 하지만 where 를 명시한다. 정책이 한 번 헐거워졌을 때
 * 쿼리가 조용히 남의 행을 세지 않게 하려는 것이다(getCurrentProfile 과 같은 방침).
 */
export async function countPlots(userId: string): Promise<number> {
  const supabase = await getSupabaseServer();

  const { count, error } = await supabase
    .from("plots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return count ?? 0;
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

/** 카드 목록이 읽는 컬럼. 지도용 select 와 달라 따로 적는다. */
const CARD_COLUMNS =
  "id, name, area_m2, region_ko, crops, sowing_date, sowing_unknown, created_at";

/**
 * 등록한 텃밭을 카드 목록으로.
 *
 * 홈의 요약 줄과 텃밭 관리 화면이 **같은 함수**를 쓴다. 두 벌로 두면 한쪽만
 * 고쳐져 같은 밭이 화면마다 다르게 보인다. 최근에 등록한 밭이 위로 온다.
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

/**
 * 텃밭의 **이름과 넓이만** 고친다.
 *
 * ⚠️ 위경도를 받지 않는다. `grid_x`·`grid_y` 는 위경도에서 계산되는 값이라
 *    좌표만 바뀌면 엉뚱한 동네의 예보를 받는다(`editPlot.ts` 와
 *    `20260915120000_plots_manage.sql` 이 같은 경고를 적어 두었다).
 *
 * `.select("id")` 로 고친 행을 돌려받아 0건이면 던진다. update 는 조건에 맞는 행이
 * 없어도 **오류가 아니라 0건으로 조용히 끝나기** 때문이다 — 그대로 성공으로
 * 넘기면 화면은 저장됐다고 말하고 값은 그대로인 상태가 된다
 * (`recordConsentForUser` 에서 실제로 겪은 함정).
 */
export async function updatePlotBasics(
  userId: string,
  input: PlotEditInput,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .update({ name: input.name, area_m2: input.areaM2 })
    .eq("id", input.plotId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("PLOT_NOT_FOUND");
}

/**
 * 텃밭을 지운다. 되돌릴 수 없다.
 *
 * 딸려 지울 것은 아직 없다 — `plots.id` 를 참조하는 테이블이 하나도 없다.
 * // ponytail: 하드 삭제. 되살리기가 필요해지면 deleted_at 컬럼 + 모든 읽기
 * //           경로의 필터로 올린다(정책 수정이 같이 따라온다).
 *
 * 0건이면 던지는 이유는 `updatePlotBasics` 와 같다. 남의 밭 id 를 보냈거나 이미
 * 지워진 뒤인데, 조용히 성공으로 넘기면 화면만 지워진 것처럼 보인다.
 */
export async function deletePlot(
  userId: string,
  plotId: string,
): Promise<void> {
  if (!plotId) throw new Error("PLOT_NOT_FOUND");

  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .delete()
    .eq("id", plotId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("PLOT_NOT_FOUND");
}
