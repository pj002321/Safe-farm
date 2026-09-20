/**
 * ---------------------------------------------
 * [Feature]: 사용자가 더한 생육 단계 입력값 좁히기 (순수)
 *
 * [Description]
 * - 단계표(`crop_stages`)에 없는 일을 사용자가 자기 재배에만 붙인다. 고추를
 *   거둔 뒤의 **말림·가공**처럼 작물 공통 자료에는 없지만 그 사람에게는 단계인 것.
 * - **마스터를 건드리지 않는다.** `crop_stages` 는 농사로에서 온 작물 공통 자료라
 *   한 사람이 고치면 남의 화면이 같이 바뀐다. 이 값은
 *   `cultivation_events` 의 `STAGE_ADD` 행으로만 남는다.
 * - **앞날짜를 받는다.** 메모(`observationNote.ts`)와 반대다. 메모는 "있었던 일"
 *   이라 미래가 오타지만, 단계는 "언제 할 것인가"를 미리 적을 수 있다. 화면이
 *   지난 것은 진하게, 아직인 것은 연하게 그린다.
 *
 * [Usage]
 * ```ts
 * const parsed = parseUserStage({ nameKo: "말림", occurredOn: "2026-10-05" });
 * if (parsed.ok) parsed.value.nameKo;
 * ```
 * ---------------------------------------------
 */

/**
 * 단계 이름 길이 상한.
 *
 * 마스터 단계 이름이 "줄기비대기" 처럼 짧아서, 길면 타임라인 한 줄이 무너진다.
 * 길게 적을 말은 관찰 기록이 받는다.
 */
export const USER_STAGE_NAME_MAX_LENGTH = 20;

export interface UserStageInput {
  nameKo: string;
  /** 그 단계를 한(또는 할) 날 (`"YYYY-MM-DD"`). */
  occurredOn: string;
}

export type ParseUserStageResult =
  | { ok: true; value: UserStageInput }
  | { ok: false; messageKo: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 폼 값 하나를 다듬은 문자열로. 공백만 남으면 null. */
function text(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 단계 한 건을 좁힌다. */
export function parseUserStage(raw: {
  nameKo?: unknown;
  occurredOn?: unknown;
}): ParseUserStageResult {
  const occurredOn = text(raw.occurredOn);
  if (occurredOn === null || !DATE_PATTERN.test(occurredOn)) {
    return { ok: false, messageKo: "날짜를 확인해 주세요." };
  }

  const nameKo = text(raw.nameKo);
  if (nameKo === null) {
    return { ok: false, messageKo: "단계 이름을 적어 주세요." };
  }
  if (nameKo.length > USER_STAGE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      messageKo: `단계 이름은 ${USER_STAGE_NAME_MAX_LENGTH}자까지 적을 수 있습니다.`,
    };
  }

  return { ok: true, value: { nameKo, occurredOn } };
}
