/**
 * ---------------------------------------------
 * [Feature]: 관찰 기록 입력값 좁히기 (순수)
 *
 * [Description]
 * - 사용자가 남기는 메모를 `cultivation_events` 의 `NOTE` 행으로 넣기 전에 값을
 *   검사한다. 저장은 `eventStore.ts` 가 한다.
 * - **본문이 비면 막는다.** 빈 메모를 넣으면 타임라인에 빈 줄이 생긴다. DB 의
 *   `ck_cultivation_events_payload` 와 같은 조건이다.
 * - ⚠ **담은 할 일이 있을 때만 예외다**(`bodyOptional`). 카드를 담아 `기록
 *   남기기` 를 누른 사람에게 메모까지 치라고 하면, 전에 `했음` 한 번으로 끝나던
 *   일이 늘어난다. 그때는 `NOTE` 줄을 안 만들고 `TASK_DONE` 줄만 남긴다 —
 *   빈 줄이 생기지 않으므로 위의 까닭에도 어긋나지 않는다.
 * - 사진은 받지 않는다. 업로드는 AI 사진 분석과 한 묶음이라 그 브랜치로 미뤘다
 *   (`20260917140000_cultivation_events_drop_photo.sql`).
 *
 * [Usage]
 * ```ts
 * const parsed = parseNote({ body: "잎에 구멍", occurredOn: "2026-09-17" });
 * if (parsed.ok) parsed.value.body;
 * ```
 * ---------------------------------------------
 */

/** 메모 본문 길이 상한. 한 줄 기록이지 일기가 아니다. */
export const NOTE_MAX_LENGTH = 500;

export interface NoteInput {
  /** 담은 할 일만 남기는 경우 `null`. 그때 `NOTE` 줄은 만들지 않는다. */
  body: string | null;
  /** 언제 있었던 일인가 (`"YYYY-MM-DD"`). */
  occurredOn: string;
}

export type ParseNoteResult =
  | { ok: true; value: NoteInput }
  | { ok: false; messageKo: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 폼 값 하나를 다듬은 문자열로. 공백만 남으면 null. */
function text(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 메모 한 건을 좁힌다.
 *
 * 날짜가 미래면 막는다. "언제 있었던 일인가"를 적는 칸이라 미래 날짜는 오타이고,
 * 그대로 두면 타임라인 맨 위에 박혀 내려오지 않는다.
 *
 * `bodyOptional` 이면 빈 메모를 통과시키고 `body: null` 로 돌려준다. 담은 할 일이
 * 있어 남길 것이 이미 있는 경우다 — 부르는 쪽이 그때만 켠다.
 */
export function parseNote(raw: {
  body?: unknown;
  occurredOn?: unknown;
  today: string;
  bodyOptional?: boolean;
}): ParseNoteResult {
  const occurredOn = text(raw.occurredOn);
  if (occurredOn === null || !DATE_PATTERN.test(occurredOn)) {
    return { ok: false, messageKo: "날짜를 확인해 주세요." };
  }
  if (occurredOn > raw.today) {
    return { ok: false, messageKo: "앞으로의 날짜는 적을 수 없습니다." };
  }

  const body = text(raw.body);

  if (body === null && raw.bodyOptional !== true) {
    return { ok: false, messageKo: "메모를 적어 주세요." };
  }
  if (body !== null && body.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      messageKo: `메모는 ${NOTE_MAX_LENGTH}자까지 적을 수 있습니다.`,
    };
  }

  return { ok: true, value: { body, occurredOn } };
}
