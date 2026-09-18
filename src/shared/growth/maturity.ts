/**
 * ---------------------------------------------
 * [Feature]: 숙기(조생·중생·만생) 어휘 — 한 곳
 *
 * [Description]
 * - DB 는 `crop_variants.maturity_type` 에 EARLY / MID / LATE 세 코드만 둔다
 *   (`ck_crop_variants_maturity`). 화면 라벨·기본값·대체 순서는 코드가 정한다.
 * - **왜 shared 인가.** `crops`(작물 카드) · `cultivations`(등록 파싱) · 컴포넌트가
 *   전부 이 어휘를 쓰는데 features 끼리는 import 금지다(루트 CLAUDE.md). 그래서
 *   2026-09-18 에 같은 값이 다섯 파일에 따로 적혀 있었고, "기본은 중생" 이 화면과
 *   서버에 각각 박혀 한쪽만 바꾸면 어긋나는 상태였다. `gdd.ts` 와 같은 자리로 모은다.
 * - 차례가 곧 조·중·만 차례다. 라디오도, 비교도 이 순서를 쓴다.
 *
 * [Usage]
 * ```ts
 * toMaturityType(formData.get("maturity.5"))   // "MID" | null
 * MATURITY_LABEL_KO.LATE                        // "만생종"
 * ```
 * ---------------------------------------------
 */

/** 조·중·만 차례. 화면이 이 순서로 그린다. */
export const MATURITY_TYPES = ["EARLY", "MID", "LATE"] as const;

export type MaturityType = (typeof MATURITY_TYPES)[number];

export const MATURITY_LABEL_KO: Record<MaturityType, string> = {
  EARLY: "조생종",
  MID: "중생종",
  LATE: "만생종",
};

/**
 * 사용자가 안 골랐을 때의 기본. 가장 보편적이고, 셋 중 가운데라 틀려도 덜 어긋난다.
 * 조생은 가장 짧아 잘못 잡히면 **늘 이르게** 틀린다 — 2026-09-18 에 실제 논이 그렇게
 * "수확 시기를 지났습니다" 를 띄웠다.
 */
export const DEFAULT_MATURITY: MaturityType = "MID";

/**
 * 고른 숙기가 없거나 그 숙기 행이 없을 때 고르는 차례. 앞이 먼저다.
 * 2026-09-18 기준 89작물 중 88개에 MID 가 있고 메밀만 EARLY+LATE 라 두 번째 칸이 쓰인다.
 */
export const MATURITY_FALLBACK_ORDER: readonly MaturityType[] = [
  "MID",
  "EARLY",
  "LATE",
];

/**
 * 바깥에서 온 값을 셋 중 하나로 좁힌다. 아니면 null.
 *
 * 폼(`maturity.<cropId>`)이나 DB 행처럼 글자로 오는 것을 그대로 믿지 않는다 —
 * 폼 밖에서 직접 POST 하면 아무 글자나 올 수 있고, 그 값이 DB CHECK 에 걸려 등록
 * 전체가 깨진다.
 */
export function toMaturityType(value: unknown): MaturityType | null {
  return MATURITY_TYPES.find((m) => m === value) ?? null;
}
