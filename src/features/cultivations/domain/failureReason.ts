/**
 * ---------------------------------------------
 * [Feature]: 재배 실패 사유 (순수)
 *
 * [Description]
 * - 실패한 재배를 목록에서 지우지 않고 사유와 함께 남긴다. "왜 그만뒀나"가
 *   쌓여야 어느 단계에서 사람들이 떨어져 나가는지 보인다.
 * - **자유 입력으로 받지 않는다.** 집계가 목적인데 자유 입력은 같은 뜻이 열
 *   가지 문장으로 들어온다. 코드는 `ck_cultivations_failure_reason` 이 DB 에서
 *   한 번 더 막는다 — 두 곳의 목록이 어긋나면 insert 가 실패한다.
 * - 선택지가 모자라면 `OTHER` 비율을 보고 늘린다. 처음부터 스무 개를 늘어놓으면
 *   사용자가 고르지 않고 창을 닫는다.
 *
 * [Usage]
 * ```ts
 * FAILURE_REASONS.map((r) => r.labelKo);   // 화면의 선택지
 * failureReasonKo("PEST");                 // "병해충"
 * ```
 * ---------------------------------------------
 */

export type FailureReasonCode =
  | "PEST"
  | "DISEASE"
  | "WEATHER"
  | "WATER"
  | "NUTRIENT"
  | "SEED"
  | "MANAGE"
  | "OTHER";

export interface FailureReason {
  code: FailureReasonCode;
  labelKo: string;
  /** 무엇을 고르면 되는지 한 줄. 선택지 이름만으로는 경계가 흐리다. */
  hintKo: string;
}

/**
 * 화면에 뿌리는 순서 그대로다.
 *
 * ⚠️ `supabase/migrations/20260917120000_cultivation_failure.sql` 의 체크 제약과
 *    **코드 목록이 같아야 한다.** 여기에만 더하면 저장 시점에 막힌다.
 */
export const FAILURE_REASONS: readonly FailureReason[] = [
  { code: "PEST", labelKo: "병해충", hintKo: "벌레가 먹거나 병이 번졌습니다" },
  {
    code: "DISEASE",
    labelKo: "생리장해",
    hintKo: "무름·갈라짐처럼 병은 아닌데 상했습니다",
  },
  {
    code: "WEATHER",
    labelKo: "기상",
    hintKo: "한파·폭염·태풍·우박 때문입니다",
  },
  {
    code: "WATER",
    labelKo: "물 관리",
    hintKo: "너무 마르거나 물에 잠겼습니다",
  },
  {
    code: "NUTRIENT",
    labelKo: "양분·토양",
    hintKo: "거름이 모자라거나 과했습니다",
  },
  {
    code: "SEED",
    labelKo: "씨앗·모종",
    hintKo: "처음부터 싹이 안 나거나 모종이 약했습니다",
  },
  { code: "MANAGE", labelKo: "돌보지 못함", hintKo: "손이 못 갔습니다" },
  { code: "OTHER", labelKo: "기타", hintKo: "위에 없습니다" },
];

const BY_CODE = new Map(FAILURE_REASONS.map((reason) => [reason.code, reason]));

/** 코드를 화면 문구로. 모르는 코드는 "기타" 로 떨어뜨린다 — 빈칸을 보이지 않는다. */
export function failureReasonKo(code: string | null): string {
  if (code === null) return "사유 미기재";
  return BY_CODE.get(code as FailureReasonCode)?.labelKo ?? "기타";
}

/**
 * 폼에서 온 값을 코드로 좁힌다.
 *
 * 목록에 없으면 null 이다. `OTHER` 로 바꿔 주지 않는다 — 폼이 깨진 것과
 * 사용자가 기타를 고른 것은 다른 일이고, 뭉개면 집계가 조용히 부풀어 오른다.
 */
export function parseFailureReason(raw: unknown): FailureReasonCode | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  return BY_CODE.has(code as FailureReasonCode)
    ? (code as FailureReasonCode)
    : null;
}
