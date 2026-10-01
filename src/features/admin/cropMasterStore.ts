import "server-only";
import { getSupabaseAdmin } from "@/shared/supabase/server";
import { cropIssues } from "./domain/cropAudit";
/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터 조회 (V1-108~110, 읽기 전용)
 *
 * [Description]
 * - 마스터는 `safefarm-crop-data` CSV 시딩이 정본이라 여기서 고치지 않는다 —
 *   고쳐도 다음 시딩이 덮어쓴다. 결함은 CSV 를 고쳐 다시 시딩한다.
 * - `getSupabaseAdmin()` 으로 읽는다. 사용자용 RLS 정책(`base_temp` 있는 작물만 보이는
 *   화면 기준)과 무관하게 **빈 행까지** 봐야 결함이 보인다.
 * ---------------------------------------------
 */

export interface CropMasterRow {
  cropId: number;
  nameKo: string;
  baseTemp: number | null;
  upperTemp: number | null;
  variants: {
    maturityType: string;
    gddTarget: number | null;
    stages: number;
  }[];
  issues: string[];
}

interface Raw {
  crop_id: number;
  name: string;
  base_temp: number | null;
  upper_temp: number | null;
  crop_variants: {
    maturity_type: string;
    gdd_target: number | null;
    crop_stages: { gdd_to: number }[];
  }[];
}

// Numeric 컬럼은 PostgREST 가 문자열로 줄 수 있다.
const num = (v: number | string | null) => (v === null ? null : Number(v));

export async function listCropMaster(): Promise<CropMasterRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("crops")
    .select(
      "crop_id, name, base_temp, upper_temp, crop_variants(maturity_type, gdd_target, crop_stages(gdd_to))",
    )
    .order("name");
  if (error) throw new Error(error.message);

  return (data as unknown as Raw[]).map((row) => {
    const variants = row.crop_variants.map((v) => ({
      maturityType: v.maturity_type,
      gddTarget: num(v.gdd_target),
      stageGddTos: v.crop_stages.map((s) => Number(s.gdd_to)),
    }));
    const baseTemp = num(row.base_temp);
    return {
      cropId: row.crop_id,
      nameKo: row.name,
      baseTemp,
      upperTemp: num(row.upper_temp),
      variants: variants.map((v) => ({
        maturityType: v.maturityType,
        gddTarget: v.gddTarget,
        stages: v.stageGddTos.length,
      })),
      issues: cropIssues({ baseTemp, variants }),
    };
  });
}
