import type { TaskAdvice } from "@/shared/growth/taskAdvice";

/**
 * ---------------------------------------------
 * [Feature]: 장바구니에 담은 할 일 (순수)
 *
 * [Description]
 * - `했음` 은 **바로 저장하지 않는다.** 누르면 관찰 기록으로 카드가 옮겨가고,
 *   거기서 카드마다 메모 한 줄을 적은 뒤 `기록 남기기` 로 한 번에 저장한다.
 *   잘못 눌러도 `취소` 로 되돌릴 수 있다 — 전에는 지우기밖에 없었다.
 * - **담아 둔 상태는 URL 쿼리에 산다**(`?picked=물주기,김매기`). 상태를 들면
 *   Client Component 가 되는데, 이 화면은 **JS 가 0줄**인 것이 성질이다.
 *   `했음`·`취소` 는 버튼이 아니라 **링크**다.
 * - **제목으로 담는다.** 추천 카드는 규칙이 매번 다시 만드는 계산값이라 id 를
 *   담아도 다음 요청에서 가리킬 대상이 없다(`completeTask` 독스트링과 같은 이유).
 *   `domain/doneTasks.ts` 가 거를 때 쓰는 열쇠와도 같은 것이라야 한다.
 *
 * ⚠ **쉼표가 든 제목은 담지 못한다.** 쿼리에서 쉼표로 가르기 때문이다. 지금
 *   `taskAdvice.ts` 와 ai-service 의 제목에 쉼표가 없어 문제가 없고, 생기면
 *   `pickedFromQuery` 가 그 조각을 목록에 없는 값으로 보고 버린다 — 조용히
 *   틀리지는 않는다(목록에 있는 제목만 통과시킨다).
 *
 * [Usage]
 * ```ts
 * const picked = pickedFromQuery(searchParams.picked, tasks);
 * withPicked(picked, "김매기");     // 담기
 * withoutPicked(picked, "김매기");  // 빼기
 * ```
 * ---------------------------------------------
 */

/** 카드별 메모 길이 상한. 카드 하나에 한 줄이라 메모(500)보다 짧다. */
export const TASK_NOTE_MAX_LENGTH = 100;

/** 쿼리에서 담은 것들을 가르는 글자. */
const SEPARATOR = ",";

/**
 * 쿼리 값 → 담은 제목들.
 *
 * **지금 뜨는 카드에 있는 제목만 통과시킨다.** 주소창을 손으로 고쳐 아무 글자나
 * 넣어도 저장 화면에 들어오지 못한다. 조건이 바뀌어 사라진 카드도 같이 빠진다 —
 * 어제 담아 둔 주소를 오늘 열었을 때 없는 일을 저장하면 안 된다.
 */
export function pickedFromQuery(
  raw: string | string[] | undefined,
  tasks: readonly TaskAdvice[],
): readonly string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];

  const known = new Set(tasks.map((task) => task.titleKo));
  const seen = new Set<string>();
  return value
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => {
      if (!known.has(part) || seen.has(part)) return false;
      seen.add(part);
      return true;
    });
}

/** 쿼리에 실을 글자. 빈 목록이면 `null` — 그때는 `picked` 를 아예 안 붙인다. */
export function pickedToQuery(picked: readonly string[]): string | null {
  return picked.length === 0 ? null : picked.join(SEPARATOR);
}

/** 하나 담은 목록. 이미 있으면 그대로 둔다. */
export function withPicked(
  picked: readonly string[],
  titleKo: string,
): readonly string[] {
  return picked.includes(titleKo) ? picked : [...picked, titleKo];
}

/** 하나 뺀 목록. */
export function withoutPicked(
  picked: readonly string[],
  titleKo: string,
): readonly string[] {
  return picked.filter((title) => title !== titleKo);
}

/**
 * 담은 카드의 메모를 폼에 실을 때 쓰는 이름.
 *
 * 제목을 이름에 그대로 박는다. 자리(`taskNote0`)로 매기면 목록이 바뀌었을 때
 * 메모가 **다른 카드에 붙는다** — 담는 사이에 조건이 바뀌어 카드가 사라질 수 있다.
 */
export function taskNoteField(titleKo: string): string {
  return `taskNote:${titleKo}`;
}

/**
 * 담은 목록을 실은 주소. `했음`·`취소` 링크가 이걸 쓴다.
 *
 * 쿼리만 적은 상대 주소라 지금 보고 있는 경로에 그대로 붙는다 — 밭 id·재배 id 를
 * 들고 다닐 필요가 없다. 비면 `?` 다. `?picked=` 로 두면 빈 값이 한 번 더 도는데,
 * 어차피 `pickedFromQuery` 가 빈 목록으로 읽으므로 짧은 쪽으로 간다.
 *
 * ⚠ `error`·`saved` 같은 다른 쿼리는 일부러 안 가져온다. 저 둘은 방금 한 일에
 *   대한 말이라, 카드를 담는 순간 이미 지난 이야기다.
 */
export function pickedHref(picked: readonly string[]): string {
  const query = pickedToQuery(picked);
  return query === null ? "?" : `?picked=${encodeURIComponent(query)}`;
}
