import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import type { PlotEditInput } from "./domain/editPlot";
import {
  type PlotCard,
  type PlotDetail,
  type PlotMapPoint,
  toPlotCard,
  toPlotDetail,
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
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** 로그인한 사용자가 등록한 텃밭 좌표 목록. */
export async function listPlots(userId: string): Promise<PlotMapPoint[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select(`id, name, latitude, longitude, grid_x, grid_y, ${CULTIVATION_SELECT}`)
    // RLS가 자기 밭만 보이게 하지만, profileStore.ts처럼 where도 명시한다.
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("cultivations.deleted_at", null);

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
    .select(`id, name, latitude, longitude, grid_x, grid_y, ${CULTIVATION_SELECT}`)
    .eq("user_id", userId)
    .eq("id", plotId)
    .is("deleted_at", null)
    .is("cultivations.deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ? toPlotMapPoint(data) : null;
}

/**
 * 밭 상세 화면이 읽는 밭 한 행. 없거나 남의 밭이면 null.
 *
 * `getPlot()` 과 나눈 이유는 상세가 지역·넓이를 쓰고 작물은 안 쓰기 때문이다.
 * 지도용 반환 모양을 넓히면 `map/page.tsx` 가 같이 흔들린다.
 */
export async function getPlotDetail(
  userId: string,
  plotId: string,
): Promise<PlotDetail | null> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select("id, name, region_ko, area_m2, latitude, longitude, grid_x, grid_y")
    .eq("user_id", userId)
    .eq("id", plotId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ? toPlotDetail(data) : null;
}

/**
 * 좌표·격자가 필요한 화면이 읽는 밭 전체. 날씨(`/weather`)가 쓴다.
 *
 * `listPlotCards()` 와 나눈 이유는 그쪽이 작물을 같이 끌고 오기 때문이다 —
 * 날씨는 작물을 안 보고, 대신 `getPlotDetail()` 과 같은 컬럼이 필요하다.
 */
export async function listPlotDetails(userId: string): Promise<PlotDetail[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select("id, name, region_ko, area_m2, latitude, longitude, grid_x, grid_y")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map(toPlotDetail);
}

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
    .is("deleted_at", null)
    .is("cultivations.deleted_at", null)
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
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("PLOT_NOT_FOUND");
}

/**
 * 텃밭을 숨긴다. 행은 남는다(soft delete).
 *
 * 이름이 `delete` 가 아닌 이유는 실제로 도는 쿼리가 update 라서다. 사용자에게는
 * 삭제지만 DB 에는 `deleted_at` 이 찍힐 뿐이고, 그 차이를 이름이 감추면 다음
 * 사람이 "지웠는데 왜 아직 조회되나"를 쿼리 로그에서 찾게 된다.
 *
 * 하드 삭제로 안 가는 이유는 `20260917000000_soft_delete.sql` 에 적었다 —
 * 관찰 기록이 cascade 로 함께 사라진다.
 *
 * 딸린 재배도 같이 숨긴다. **밭을 먼저 찍고 재배를 나중에 찍는다** — 반대로 하다
 * 중간에 실패하면 작물만 사라진 멀쩡한 밭이 남는다. 이 순서면 밭이 이미 안 보여
 * 딸린 재배가 어디에도 안 뜬다.
 *
 * 0건이면 던지는 이유는 `updatePlotBasics` 와 같다. 남의 밭 id 를 보냈거나 이미
 * 지워진 뒤인데, 조용히 성공으로 넘기면 화면만 지워진 것처럼 보인다.
 */
export async function softDeletePlot(
  userId: string,
  plotId: string,
): Promise<void> {
  if (!plotId) throw new Error("PLOT_NOT_FOUND");

  const supabase = await getSupabaseServer();
  const deletedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("plots")
    .update({ deleted_at: deletedAt })
    .eq("id", plotId)
    .eq("user_id", userId)
    // 이미 지운 밭을 다시 지우면 시각이 덮어써져 "언제 지웠나"가 틀어진다.
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("PLOT_NOT_FOUND");

  // `cultivations` 는 features/cultivations 소관이지만 여기서 직접 찍는다.
  // features 끼리 import 하는 것이 규칙 위반이고, 둘을 한 트랜잭션처럼 묶을
  // 곳이 서버 액션밖에 없는데 그러면 밭 삭제를 부르는 모든 화면이 재배까지
  // 알아야 한다. RLS 는 plots 를 경유하므로 소유 확인은 그대로 걸린다.
  const { error: cultivationError } = await supabase
    .from("cultivations")
    .update({ deleted_at: deletedAt })
    .eq("plot_id", plotId)
    .is("deleted_at", null);

  if (cultivationError) throw new Error(cultivationError.message);

  // 할 일 카드는 **실제로 지운다.** `plot_tasks` 에는 `deleted_at` 이 없고,
  // 대시보드 조회(`taskStore.listTaskCards`)가 `plots.deleted_at` 을 안 보므로
  // 남겨 두면 숨긴 밭의 할 일이 그대로 뜬다. 규칙에서 나온 파생 자료라
  // ai-service 가 다시 만들어 주니 지워도 잃는 자료가 없다
  // (`20260917000000_plot_tasks_delete.sql` 이 delete 권한을 준 이유).
  // 되돌릴 수 없는 단계라 밭을 숨긴 뒤 맨 마지막에 둔다.
  const tasksDeleted = await supabase
    .from("plot_tasks")
    .delete()
    .eq("plot_id", plotId);
  if (tasksDeleted.error) throw new Error(tasksDeleted.error.message);
}
