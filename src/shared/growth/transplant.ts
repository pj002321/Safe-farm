/**
 * ---------------------------------------------
 * [Feature]: "옮겨 심는다" 를 알아보는 낱말 — 한 곳
 *
 * [Description]
 * - **왜 shared 인가.** 같은 개념을 두 곳이 따로 적고 있었고 목록이 달랐다(2026-09-19).
 *     `crops/domain/cropOption.ts`       아주심기 · 정식 · 모내기 · 이앙
 *     `cultivations/domain/seedlingStart.ts`  아주심기 · 정식 · 이식 · 모내기 · 옮겨
 *   features 끼리는 import 금지라(루트 CLAUDE.md) 한쪽을 고쳐도 다른 쪽이 안 따라왔다.
 *   `maturity.ts` 가 같은 까닭으로 먼저 만들어진 자리다 — 그 옆에 둔다.
 *
 * - **보는 칸이 둘이라 찾는 방법도 둘이다.** 낱말은 하나로 두고 방법만 가른다.
 *     `crop_variants.sow_method`  대표 작업명 하나. 값이 정해져 있어 **정확히 같은지**
 *     `crop_stages.stage_name`    단계 이름. '이앙활착기'·'아주심기, 웃거름' 처럼
 *                                 다른 말이 붙어 오므로 **들어 있는지**
 *
 * - 목록을 합치면서 실측으로 확인한 것(2026-09-19):
 *     sow_method  더 걸리는 값 없음 — 동작 그대로
 *     stage_name  `이앙활착기` 둘이 새로 걸린다. 사료용 벼 2숙기가 이식 보정을
 *                 못 받고 있었다(null). 10.1% · 15.4% 자리라 문턱(40%) 아래다 — 개선이다
 *
 * [Usage]
 * ```ts
 * isTransplantMethod("아주심기")   // true  — sow_method 용
 * hasTransplantWord("이앙활착기")  // true  — stage_name 용
 * ```
 * ---------------------------------------------
 */

/**
 * 옮겨 심는 일을 가리키는 말.
 *
 * ⚠️ 씨 쪽 낱말(씨뿌림·파종·육묘·모기르기)은 여기 넣지 않는다. 이 목록의 뜻은
 *   "이미 자란 모를 밭으로 옮긴다" 하나다.
 * ⚠️ `이앙` 은 모내기의 한자말이다. 원문이 둘을 섞어 쓴다.
 */
export const TRANSPLANT_WORDS = [
  "아주심기",
  "정식",
  "이식",
  "모내기",
  "이앙",
  "옮겨",
] as const;

const TRANSPLANT_SET: ReadonlySet<string> = new Set(TRANSPLANT_WORDS);
const TRANSPLANT_RE = new RegExp(TRANSPLANT_WORDS.join("|"));

/** `sow_method` 가 옮겨심기 작업인가. 값이 정해져 있어 **정확히 같은지**로 본다. */
export function isTransplantMethod(method: string | null | undefined): boolean {
  return TRANSPLANT_SET.has((method ?? "").trim());
}

/** `stage_name` 이 옮겨심기 단계인가. 다른 말이 붙어 오므로 **들어 있는지**로 본다. */
export function hasTransplantWord(name: string | null | undefined): boolean {
  return TRANSPLANT_RE.test(name ?? "");
}
