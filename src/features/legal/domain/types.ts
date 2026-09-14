/**
 * ---------------------------------------------
 * [Feature]: 법적 고지 문서의 모양
 *
 * [Description]
 * - 약관과 개인정보처리방침이 같은 구조를 공유한다. 문서를 **데이터로** 두는
 *   이유는 두 가지다. ① 화면과 내용이 섞이지 않아 문구만 고칠 수 있다.
 *   ② 동의 화면(`consent.ts`)과 이 문서가 **서로 다른 말을 하지 않는지**
 *   나중에 테스트로 묶을 수 있다.
 * - 개정 이력을 문서에 포함한다. 약관은 언제 무엇이 바뀌었는지가 내용만큼
 *   중요하고, 그게 없으면 이용자가 동의한 버전을 특정할 수 없다.
 *
 * [Usage]
 * ```ts
 * import { PRIVACY_POLICY } from "./privacy";
 * PRIVACY_POLICY.sections.map((s) => s.titleKo);
 * ```
 * ---------------------------------------------
 */

/** 표. 항목·목적·기간처럼 나란히 놓아야 읽히는 것에만 쓴다. */
export interface LegalTable {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}

export interface LegalSection {
  /** 목차 앵커. 링크로 특정 조항을 가리킬 수 있어야 한다. */
  id: string;
  titleKo: string;
  paragraphs?: readonly string[];
  /** 나열이 자연스러운 것(수집 항목 등). */
  bullets?: readonly string[];
  table?: LegalTable;
  /** 눈에 띄어야 하는 단서. 책임 범위·거부권 같은 것. */
  noteKo?: string;
}

export interface LegalDocument {
  titleKo: string;
  /** 첫 화면에 놓는 한 문단 요약. 전문을 안 읽는 사람이 대부분이다. */
  summaryKo: string;
  /** 시행일. 개정하면 이 값과 history 를 함께 갱신한다. */
  effectiveDateKo: string;
  sections: readonly LegalSection[];
  history: readonly { dateKo: string; changeKo: string }[];
}
