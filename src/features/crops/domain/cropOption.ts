/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터 행 → 선택 카드 값 (순수 함수)
 *
 * [Description]
 * - `CropCards` 에 박혀 있던 상수를 DB 조회로 바꾸면서, 행을 화면이 쓸 모양으로
 *   좁히는 자리가 필요해졌다. `plotSummary.ts` 의 `toPlotCard` 와 같은 역할이다.
 * - 난이도는 DB 가 한글("쉬움")로 들고 있다. 점 개수로 그리려면 숫자가 필요한데,
 *   그 변환을 컴포넌트에서 하면 테스트할 자리가 없어진다.
 * - 재배 기간은 `crops` 가 아니라 `crop_variants.days_to_harvest` 에 있다.
 *   한 작물에 품종이 여럿이라 값도 여럿이므로 범위로 접는다.
 * ---------------------------------------------
 */

export interface CropOption {
  cropId: number;
  nameKo: string;
  /** 1=쉬움 2=보통 3=어려움. 점 개수로 그린다. */
  difficultyLevel: 1 | 2 | 3;
  difficultyKo: string;
  /** "약 80일" · "80~95일". 품종이 없으면 null — 화면이 자리를 비운다. */
  durationKo: string | null;
}

export interface CropOptionRow {
  crop_id: number;
  name: string;
  difficulty: string | null;
  /** Supabase 조인 결과. 품종이 없으면 빈 배열이다. */
  crop_variants: { days_to_harvest: number | null }[];
}

export function toCropOption(row: CropOptionRow): CropOption {
  return {
    cropId: row.crop_id,
    nameKo: row.name,
    difficultyLevel: toDifficultyLevel(row.difficulty),
    difficultyKo: row.difficulty ?? "보통",
    durationKo: toDurationKo(row.crop_variants),
  };
}

/**
 * 한글 난이도 → 점 개수.
 *
 * 모르는 값은 "보통"으로 본다. 난이도 한 칸이 틀렸다고 카드를 못 그릴 이유는 없다.
 */
export function toDifficultyLevel(difficulty: string | null): 1 | 2 | 3 {
  if (difficulty === "쉬움") return 1;
  if (difficulty === "어려움") return 3;
  return 2;
}

/**
 * 품종별 재배 일수를 한 줄로 접는다.
 *
 * 품종이 하나면 "약 80일", 여럿이면 "80~95일". 값이 다 비면 null 을 돌려주고
 * 화면이 그 자리를 비운다 — "약 0일"이 나가면 사실이 아니다.
 */
export function toDurationKo(
  variants: readonly { days_to_harvest: number | null }[],
): string | null {
  const days = variants
    .map((v) => v.days_to_harvest)
    .filter((d): d is number => typeof d === "number" && d > 0);

  if (days.length === 0) return null;

  const min = Math.min(...days);
  const max = Math.max(...days);
  return min === max ? `약 ${min}일` : `${min}~${max}일`;
}
