/**
 * ---------------------------------------------
 * [Feature]: 진단용 이미지·질문 입력값 좁히기 (순수 함수)
 *
 * [Description]
 * - 허용 형식·크기 상한의 **정본은 ai-service 의 `domain/image_upload.py`** 다.
 *   여기 값은 "미리 알려주기" 용이라, 바꿀 때 양쪽을 함께 본다.
 * - 질문은 선택이다 — 비우면 화면이 기본 질문 문구를 보여줄 뿐 서버로는 null 을 보낸다.
 *
 * [Usage]
 * ```ts
 * const parsed = parseImageDataUrl(raw);
 * if (!parsed.ok) return { error: parsed.error };
 * ```
 * ---------------------------------------------
 */

/** ai-service `image_upload.MAX_IMAGE_DATA_URL_CHARS` 와 같은 값. */
export const MAX_IMAGE_DATA_URL_CHARS = 15_000_000;

const ALLOWED_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
] as const;

export type ParseImageDataUrlResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function parseImageDataUrl(raw: unknown): ParseImageDataUrlResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "사진을 선택해 주세요." };
  }
  if (!ALLOWED_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return {
      ok: false,
      error: "jpeg·png·webp 형식의 사진만 올릴 수 있습니다.",
    };
  }
  if (raw.length > MAX_IMAGE_DATA_URL_CHARS) {
    return { ok: false, error: "사진 용량이 너무 큽니다." };
  }
  return { ok: true, value: raw };
}

/** ai-service `schemas/diagnose.py` 의 `question` max_length 와 같은 값. */
export const DIAGNOSE_QUESTION_MAX_LENGTH = 500;

/** 질문은 선택이라 비어 있으면 null — 빈 문자열을 그대로 보내지 않는다. */
export function parseDiagnoseQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  return value.slice(0, DIAGNOSE_QUESTION_MAX_LENGTH);
}
