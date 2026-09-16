import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import { type CropOption, toCropOption } from "./domain/cropOption";

/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터 조회 (서버 전용)
 *
 * [Description]
 * - `crops` · `crop_variants` 는 ai-service 가 적재하는 **공용 참조 데이터**다.
 *   사용자별 데이터가 아니라 누가 보든 같은 값이 나온다.
 * - 그래서 `userId` 를 받지 않는다. 인자만으로 결과가 정해져야 나중에 캐시를
 *   얹을 수 있다 — 사용자별 조회(`plotStore`)와 같은 파일에 두지 않는 이유다.
 * - ⚠️ 이 테이블들에 `grant select to authenticated` 와 정책이 없으면 **오류 없이
 *   0행**이 돌아온다. ai-service 담당자와 함께 확인할 것.
 * ---------------------------------------------
 */

/**
 * 등록 폼이 고를 수 있는 작물 전부.
 *
 * `crop_variants` 를 같이 읽는 이유는 재배 기간(`days_to_harvest`)이 품종에만
 * 있어서다. 작물 수가 십여 개라 페이징하지 않는다.
 */
export async function listCropOptions(): Promise<CropOption[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("crops")
    .select("crop_id, name, difficulty, crop_variants(days_to_harvest)")
    .order("crop_id");

  if (error) throw new Error(error.message);

  return (data ?? []).map(toCropOption);
}

/**
 * 고른 작물마다 대표 품종 `variant_id` 하나를 정한다.
 *
 * 등록 폼은 작물(배추)까지만 고르는데 `cultivations` 는 품종(배추/중생)을 가리킨다
 * — 수확 목표 GDD(`crop_variants.gdd_target`)가 품종에만 있기 때문이다. 그 사이를
 * 여기서 메운다.
 *
 * ⚠️ 규칙은 **`variant_id` 가 가장 작은 것**이다. 시드 순서상 앞에 오는 품종이라
 * 결정적이긴 하지만 농학적 근거는 없다. 폼에 품종 선택을 넣거나 마스터에 대표
 * 품종 표시가 생기면 그때 바꾼다.
 *
 * 품종이 하나도 없는 작물(배추 등 일부는 아직 마스터가 비었다)은 결과에서 빠진다.
 */
export async function resolveVariantIds(
  cropIds: readonly number[],
): Promise<number[]> {
  if (cropIds.length === 0) return [];

  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("crop_variants")
    .select("variant_id, crop_id")
    .in("crop_id", cropIds)
    .order("variant_id");

  if (error) throw new Error(error.message);

  const firstByCrop = new Map<number, number>();
  for (const row of data ?? []) {
    if (!firstByCrop.has(row.crop_id)) {
      firstByCrop.set(row.crop_id, row.variant_id);
    }
  }

  return cropIds
    .map((cropId) => firstByCrop.get(cropId))
    .filter((id): id is number => id !== undefined);
}
