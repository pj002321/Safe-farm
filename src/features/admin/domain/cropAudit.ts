/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터 결함 판정 (순수 함수)
 *
 * [Description]
 * - 마스터가 비면 오류 없이 기능이 조용히 빠진다. 기준온도가 없으면 등록 폼에서
 *   작물이 사라지고(`listCropOptions` 의 not null 필터), 단계가 없으면 생육 단계가
 *   안 나온다. 화면이 그 자리를 짚어 주려는 것이다.
 * - `gdd_target` 은 마지막 단계의 `gdd_to` 와 같아야 한다(crop_variant.py 주석).
 *   어긋나면 "수확" 판정과 단계 막대가 서로 다른 끝을 본다.
 * ---------------------------------------------
 */

export interface AuditVariant {
  maturityType: string;
  gddTarget: number | null;
  stageGddTos: number[];
}

export interface AuditCrop {
  baseTemp: number | null;
  variants: AuditVariant[];
}

export function cropIssues(crop: AuditCrop): string[] {
  const issues: string[] = [];
  if (crop.baseTemp === null) issues.push("기준온도 없음");
  if (crop.variants.length === 0) issues.push("품종 없음");
  for (const v of crop.variants) {
    if (v.gddTarget === null) issues.push(`${v.maturityType} 목표 GDD 없음`);
    if (v.stageGddTos.length === 0) {
      issues.push(`${v.maturityType} 단계 없음`);
    } else if (
      v.gddTarget !== null &&
      Math.max(...v.stageGddTos) !== v.gddTarget
    ) {
      issues.push(`${v.maturityType} 목표 GDD ≠ 마지막 단계`);
    }
  }
  return issues;
}
