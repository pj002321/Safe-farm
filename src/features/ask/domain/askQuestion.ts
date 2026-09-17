/**
 * ---------------------------------------------
 * [Feature]: 질문 입력값 좁히기 (순수 함수)
 *
 * [Description]
 * - 길이 상한의 **정본은 ai-service 의 `schemas/ask.py`** 다. 거기서 422 로 막히므로
 *   여기 값은 "미리 알려주기" 용이다. 두 값이 어긋나면 화면은 보내도 된다고 하고
 *   서버가 거절하므로, 바꿀 때 양쪽을 함께 본다.
 * - 빈 질문을 막는 이유는 요금이 아니라 한도다. 공백만 보내도 이력 한 줄이 쌓여
 *   하루 횟수가 깎인다.
 * - 줄바꿈은 살리고 앞뒤 공백만 걷는다. 사용자가 문단을 나눠 물을 수 있다.
 *
 * [Usage]
 * ```ts
 * const parsed = parseQuestion(raw);
 * if (!parsed.ok) return { error: parsed.error };
 * ```
 * ---------------------------------------------
 */

/** ai-service `AskRequest.question` 의 `max_length` 와 같은 값. */
export const QUESTION_MAX_LENGTH = 500;

export type ParseQuestionResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function parseQuestion(raw: unknown): ParseQuestionResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "질문을 입력해 주세요." };
  }

  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, error: "질문을 입력해 주세요." };
  }
  if (value.length > QUESTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `질문은 ${QUESTION_MAX_LENGTH}자까지 보낼 수 있습니다.`,
    };
  }

  return { ok: true, value };
}

/**
 * 밭 id. 고르지 않았으면 null.
 *
 * 형식을 검사하지 않는다 — 남의 밭 id 를 보내도 ai-service 가 그 밭을 못 찾아
 * 컨텍스트 없이 답할 뿐이고(`ask_context.py` 는 조회만 한다), 형식 검사는 그걸
 * 막아주지 못한다. 실제 방어는 소유 확인이고 그건 페이지가 목록을 만들 때 한다.
 */
export function parsePlotId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}
