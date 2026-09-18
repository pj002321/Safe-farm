import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import { kstDateString } from "@/shared/utils/kstDate";
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
 * 있어서다. 파종 창(`sow_method`·`sow_from`·`sow_to`)도 같은 자리에 있어 한 번에
 * 가져온다 — 권장 파종 시기 안내와 "지금 심기 좋음" 배지가 이 값을 쓴다(V1-22).
 *
 * ⚠️ `base_temp` 가 빈 작물은 거른다. GDD 를 못 쌓아 밭 등록 카드가 의미가 없다 —
 *   2026-09-18 기준 133작물 중 44개가 빠지고, 그중 35개는 화훼·버섯·약초·축산이다.
 */
export async function listCropOptions(): Promise<CropOption[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("crops")
    .select(
      "crop_id, name, difficulty, crop_variants(days_to_harvest, sow_method, sow_from, sow_to)",
    )
    .not("base_temp", "is", null)
    .order("crop_id");

  if (error) throw new Error(error.message);

  // 'YYYY-MM-DD' → 'MM-DD'. 파종 창에는 연도가 없다. 서버가 UTC 로 돌아도
  // 한국 날짜로 잘라야 자정 근처에 배지가 하루 어긋나지 않는다
  const todayMmDd = kstDateString().slice(5);

  return (data ?? []).map((row) => toCropOption(row, todayMmDd));
}

/**
 * 고른 작물마다 대표 품종 `variant_id` 하나를 정한다.
 *
 * 등록 폼은 작물(배추)까지만 고르는데 `cultivations` 는 품종(배추/중생)을 가리킨다
 * — 수확 목표 GDD(`crop_variants.gdd_target`)가 품종에만 있기 때문이다. 그 사이를
 * 여기서 메운다.
 *
 * ★ 규칙은 **중생(MID) 우선**이다(2026-09-18 정함). 가장 보편적인 숙기라서다.
 *
 *   ⚠️ 예전에는 `variant_id` 가 가장 작은 것이었다. 시드 순서상 조생이 앞에 와서
 *   **모든 작물이 조생종으로 잡혔다** — 벼를 5/24 에 심은 실제 밭이 D+117 에
 *   "수확 시기를 지났습니다" 를 띄웠다(조생 1416 · 중생 1526 · 만생 1602 GDD).
 *   조생은 셋 중 가장 짧아 어긋나면 **늘 이르게** 틀린다. 중생은 가운데라 덜 어긋난다.
 *
 *   MID 가 없으면 EARLY, 그것도 없으면 LATE 다. 2026-09-18 기준 89작물 중 88개에
 *   MID 가 있고 메밀만 EARLY+LATE 다.
 *
 * ⚠️ **여전히 사용자가 고르는 것이 아니다.** 숙기가 여럿인 작물이 23개인데 폼에
 *   선택지가 없다. 폼에 숙기 라디오를 넣으면 이 함수가 그 값을 받아야 한다.
 *
 * `cropId` 로 되돌려 주는 이유는 호출자가 작물별 파종 정보(날짜·방식)와 다시
 * 이어 붙여야 해서다. 배열로 주면 품종이 없는 작물이 중간에 빠졌을 때 자리가
 * 밀려 엉뚱한 파종 정보와 짝지어진다. 품종이 하나도 없는 작물(마스터 공백)은
 * 맵에서 빠진다 — 호출자가 그 작물을 건너뛴다.
 */
const MATURITY_PRIORITY = ["MID", "EARLY", "LATE"] as const;

export async function resolveVariantIds(
  cropIds: readonly number[],
): Promise<Map<number, number>> {
  if (cropIds.length === 0) return new Map();

  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("crop_variants")
    .select("variant_id, crop_id, maturity_type")
    .in("crop_id", cropIds)
    .order("variant_id");

  if (error) throw new Error(error.message);

  const best = new Map<number, { variantId: number; rank: number }>();
  for (const row of data ?? []) {
    // 모르는 숙기가 들어와도 버리지 않는다 — 맨 뒤로 보내고, 그것뿐이면 그걸 쓴다
    const rank = MATURITY_PRIORITY.indexOf(row.maturity_type);
    const score = rank === -1 ? MATURITY_PRIORITY.length : rank;
    const found = best.get(row.crop_id);
    if (!found || score < found.rank) {
      best.set(row.crop_id, { variantId: row.variant_id, rank: score });
    }
  }

  const variantIdByCropId = new Map<number, number>();
  for (const [cropId, { variantId }] of best) {
    variantIdByCropId.set(cropId, variantId);
  }

  return variantIdByCropId;
}
