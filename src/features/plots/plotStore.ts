import "server-only";

import { cache } from "react";
import { getSupabaseServer } from "@/shared/supabase/server";
import {
  type CultivationRecord,
  type CultivationRecordRow,
  type Embedded,
  one,
  toCultivationRecord,
  toYieldKg,
} from "./domain/cultivationRecord";
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
    .select(
      `id, name, latitude, longitude, grid_x, grid_y, ${CULTIVATION_SELECT}`,
    )
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
    .select(
      `id, name, latitude, longitude, grid_x, grid_y, ${CULTIVATION_SELECT}`,
    )
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
 * 로그인 없이 보여줄 데모 밭. 랜딩 `#today` 섹션이 쓴다.
 *
 * `userId` 를 받지 않는다 — 소유자 확인이 아니라 `is_demo = true` 로 표시된
 * 그 한 행만 본다(`plots_select_demo` RLS 정책, `plots_one_demo_idx` 가 하나임을
 * 보장한다). 랜딩 조립(`page.tsx`)에서 여러 섹션이 같은 요청 안에서 부를 수
 * 있어 `getCurrentProfile()` 과 같은 이유로 `cache()` 로 감싼다.
 */
export const getDemoPlot = cache(async (): Promise<PlotDetail | null> => {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plots")
    .select("id, name, region_ko, area_m2, latitude, longitude, grid_x, grid_y")
    .eq("is_demo", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ? toPlotDetail(data) : null;
});

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

  // 할 일 카드는 **실제로 지운다.** 규칙에서 나온 파생 자료라 ai-service 가 다시
  // 만들어 준다(`20260917000000_plot_tasks_delete.sql` 이 delete 권한을 준 이유).
  // 되돌릴 수 없는 단계라 밭을 숨긴 뒤 맨 마지막에 둔다.
  //
  // 조회가 안 가려서 지우는 것은 아니다 — `taskStore.listTaskCards` ·
  // `listTaskHistory` 는 `plots!inner` 조인에 `deleted_at is null` 을 걸어 숨긴
  // 밭의 카드를 이미 가린다. 새 카드가 더 생기지 않는 것도 ai-service 의
  // `generate_daily_tasks` 가 지운 밭을 건너뛰기 때문이다.
  //
  // ⚠️ 잃는 것이 아주 없지는 않다. `done = true` 인 카드는 규칙으로 다시 만들 수
  //    없는 **실제 작업 이력**이다(별도 이력 테이블을 두지 않은 이유 —
  //    `20260916010000_plot_tasks.sql` 첫 문단). 밭을 되살리는 기능이 생기면
  //    그때는 여기를 지우지 않는 쪽으로 바꿔야 한다.
  const tasksDeleted = await supabase
    .from("plot_tasks")
    .delete()
    .eq("plot_id", plotId);
  if (tasksDeleted.error) throw new Error(tasksDeleted.error.message);
}

// ⚠️ 한 줄짜리 리터럴로 둔다. 이어 붙이면 supabase-js 가 select 를 타입 수준에서
//    못 읽어 결과가 `GenericStringError[]` 로 추론된다(`eventStore.ts` 와 같은 함정).
const RECORD_SELECT =
  "id, variant_id, sowing_date, harvested_at, failed_at, yield_kg, plot_name_at_end, plots!inner(id, name, user_id), crop_variants(crops(name))";

/**
 * 마이페이지 지난 재배 기록. **끝난 것만** 담는다 — 진행 중인 재배는 대시보드가 다룬다.
 *
 * ⚠️ **실패도 '끝난' 것이다.** 예전에는 `HARVESTED` 만 봤는데, 밭 화면이 끝난 재배를
 *    접기로 내리면서(교안 §1-5) 여기가 유일한 입구가 됐다. `FAILED` 를 빼 두면
 *    중단한 재배는 **아무 데서도 못 들어간다** — 주소를 손으로 쳐야만 열린다.
 *
 * `plots!inner` 로 조인해야 `.eq("plots.user_id", ...)` 가 루트 행(cultivations)
 * 자체를 거른다 — `!inner` 없이 걸면 내 소유가 아닌 밭은 값이 비워질 뿐, 그
 * 재배 행 자체는 그대로 남는다(PostgREST 임베디드 필터 규칙).
 */
export async function listCultivationRecords(
  userId: string,
): Promise<CultivationRecord[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivations")
    .select(RECORD_SELECT)
    .in("status", ["HARVESTED", "FAILED"])
    .eq("plots.user_id", userId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as CultivationRecordRow[])
    .map(toCultivationRecord)
    .filter((record): record is CultivationRecord => record !== null);
}

/**
 * PostgREST 가 돌려주는 날것.
 *
 * 중첩 모양(`Embedded`)과 그 껍질을 벗기는 `one()` 은 **`domain/cultivationRecord`
 * 의 것을 그대로 쓴다** — 같은 조인이라 여기서 다시 적으면 사본이 하나 더 는다.
 */
interface ExportRow {
  id: string;
  variant_id: number;
  sowing_date: string | null;
  sowing_type: string | null;
  harvested_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  /** ⚠️ `numeric` 은 문자열로 온다 — `CultivationRecordRow.yield_kg` 와 같다. */
  yield_kg: number | string | null;
  plot_name_at_end: string | null;
  plots: Embedded<{ name: string | null }>;
  crop_variants: Embedded<{ crops: Embedded<{ name: string | null }> }>;
}

/** 내보내기 한 건이 쓰는 재배 한 행. 타임라인·CSV 가 필요로 하는 칸만 모았다. */
export interface ExportCultivationRow {
  id: string;
  variantId: number;
  cropKo: string;
  plotKo: string;
  sowingDate: string | null;
  sowingType: "SEED" | "SEEDLING";
  harvestedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  yieldKg: number | null;
}

// 내보내기용. 위 `RECORD_SELECT` 와 칸이 달라(작형·실패 사유·수확량·박아 둔 밭 이름)
// 합치지 않고 나란히 둔다 — 대신 **같은 방식**으로 적는다.
// ⚠️ 여기도 한 줄짜리 리터럴이어야 한다(위 RECORD_SELECT 의 ⚠ 와 같은 함정).
const EXPORT_SELECT =
  "id, variant_id, sowing_date, sowing_type, harvested_at, failed_at, failure_reason, yield_kg, plot_name_at_end, plots!inner(name, user_id), crop_variants(crops(name))";

/**
 * 내보낼 재배들. **주인 것만** 돌려준다.
 *
 * 🔴 **여기가 IDOR 을 막는 자리다.** id 목록은 브라우저가 보내는 값이라 남의 재배
 *    id 를 섞어 넣을 수 있다. `plots!inner` 로 조인해 `plots.user_id` 를 걸어야
 *    루트 행(cultivations) 자체가 걸러진다 — `!inner` 가 없으면 남의 밭은 값만
 *    비워진 채 **재배 행은 그대로 남는다**(PostgREST 임베디드 필터 규칙).
 *
 * ⚠️ 못 찾은 id 는 조용히 빠진다. 던지지 않는 이유는 그 편이 안전해서다 — 남의
 *    id 를 넣었을 때 "없다" 와 "네 것이 아니다" 를 구별해 주면 그것도 정보다.
 *
 * ⚠️ 기르는 중인 재배도 나온다. 상세 화면이 자기 한 건을 뽑을 때 쓰는 길이라
 *    상태로 거르지 않는다 — 무엇을 내보낼지는 부르는 쪽이 정한다.
 */
export async function listCultivationsForExport(
  userId: string,
  cultivationIds: readonly string[],
): Promise<ExportCultivationRow[]> {
  if (cultivationIds.length === 0) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("cultivations")
    .select(EXPORT_SELECT)
    .in("id", [...cultivationIds])
    .eq("plots.user_id", userId)
    .is("deleted_at", null)
    // ⚠️ 순서를 정하지 않으면 PostgREST 가 주는 대로다 — 같은 것을 두 번 받아도
    //    파일 안에서 재배 차례가 달라진다. 심은 순서로 세우고, 같은 날이면 등록 순.
    .order("sowing_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as ExportRow[]).map((row) => {
    const plot = one(row.plots);
    return {
      id: row.id,
      variantId: row.variant_id,
      cropKo: one(one(row.crop_variants)?.crops)?.name ?? "이름 없는 작물",
      // 끝낸 시점에 박아 둔 이름이 먼저다. 기르는 중이면 비어 있어 지금 이름을 쓴다
      plotKo: row.plot_name_at_end ?? plot?.name ?? "이름 없는 밭",
      sowingDate: row.sowing_date,
      sowingType: row.sowing_type === "SEEDLING" ? "SEEDLING" : "SEED",
      harvestedAt: row.harvested_at,
      failedAt: row.failed_at,
      failureReason: row.failure_reason,
      yieldKg: toYieldKg(row.yield_kg),
    };
  });
}
