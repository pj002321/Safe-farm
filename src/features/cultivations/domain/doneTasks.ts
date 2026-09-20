import type { TaskAdvice } from "@/shared/growth/taskAdvice";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 이미 한 작업 카드를 목록에서 빼기 (순수)
 *
 * [Description]
 * - `했음` 을 누르면 **카드가 사라져야 한다.** 지금은 기록만 남고 카드가 그대로라
 *   사용자가 눌렀는지 안 눌렀는지 화면에서 알 수 없다.
 * - **제목으로 맞춘다.** `TaskAdvice.id` 가 있기는 하지만 **저장되지 않는다** —
 *   `completeTask` 는 `body: titleKo` 만 넣는다. 규칙이 매번 다시 만드는 계산값이라
 *   id 를 저장해도 나중에 가리킬 대상이 없어서다(그 함수의 독스트링). 그래서
 *   되읽을 때 남아 있는 것은 제목뿐이고, `TASK_DONE` 의 본문과 글자로 견준다.
 * - ⚠ **그날치만 본다.** 어제 준 물로 오늘 카드가 사라지면 안 된다. 물주기·김매기는
 *   날마다 다시 해야 하는 일이다.
 *
 * [Usage]
 * ```ts
 * const 남은카드 = hideDoneToday(tasks, entries, "2026-09-20");
 * ```
 * ---------------------------------------------
 */

/** 이 함수가 보는 만큼만. `TimelineEntry` 보다 좁게 잡아 호출부를 안 묶는다. */
export interface DoneMark {
  kind: string;
  occurredOn: string;
  bodyKo: string | null;
}

/**
 * 오늘 이미 눌러 둔 카드를 뺀 목록.
 *
 * 견주기 전에 앞뒤 공백을 턴다 — 저장할 때 `slice(0, 100)` 으로 자르므로 긴 제목은
 * 끝이 잘려 들어간다. 잘린 쪽이 원본의 앞부분과 같으면 같은 카드로 본다.
 */
export function hideDoneToday(
  tasks: readonly TaskAdvice[],
  entries: readonly DoneMark[],
  today: string,
): readonly TaskAdvice[] {
  const doneToday = new Set(
    entries
      .filter(
        (entry) =>
          entry.kind === "TASK_DONE" &&
          entry.occurredOn === today &&
          entry.bodyKo !== null,
      )
      .map((entry) => (entry.bodyKo as string).trim()),
  );
  if (doneToday.size === 0) return tasks;

  return tasks.filter((task) => {
    const title = task.titleKo.trim();
    return !doneToday.has(title) && !doneToday.has(title.slice(0, 100));
  });
}
