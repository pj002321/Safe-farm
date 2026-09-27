/**
 * ---------------------------------------------
 * [Feature]: 재배 중인 작물 분포 (관리자 개요)
 *
 * [Description]
 * - 재배 행마다 작물 이름 하나를 받아 이름별 건수로 묶고, 많은 순으로 자른다.
 * - 이름이 비면(품종·작물 조인이 끊긴 행) "미상" 으로 센다. 버리면 합계가 재배
 *   건수와 어긋나 화면의 두 숫자가 서로 다른 말을 한다.
 * ---------------------------------------------
 */

export interface CropShare {
  nameKo: string;
  count: number;
}

export function cropShare(
  names: readonly (string | null)[],
  limit: number,
): CropShare[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    const key = name ?? "미상";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([nameKo, count]) => ({ nameKo, count }))
    .sort((a, b) => b.count - a.count || a.nameKo.localeCompare(b.nameKo, "ko"))
    .slice(0, limit);
}
