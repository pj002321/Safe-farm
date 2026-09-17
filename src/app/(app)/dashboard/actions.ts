"use server";

import { redirect } from "next/navigation";
import { setTaskDone } from "@/features/dashboard/taskStore";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 대시보드 Server Actions
 *
 * [Description]
 * - ⚠️ **export 하나가 곧 공개 POST 엔드포인트**다(AGENTS.md). 첫 줄에서
 *   `requireConsent()` 를 부른다 — 페이지 검사는 액션에 미치지 않는다.
 * - `TaskBoard` 는 `src/components/` 에 있어 `src/app/` 을 import 할 수 없다
 *   (의존 방향은 shared → features → app). 그래서 이 액션은 `page.tsx` 가 읽어
 *   `TaskBoard` 에 **prop 으로 내려준다** — 컴포넌트는 "완료 버튼을 누르면 부를
 *   함수" 라는 모양만 알고, 그게 Server Action 이라는 건 몰라도 된다.
 * - 실패해도 화면을 못 그리게 막을 이유가 없어 조용히 되돌아간다. 실패 배너는
 *   지금 대시보드에 자리가 없다 — 필요해지면 `plots/actions.ts` 의 `fail()`
 *   패턴(쿼리로 메시지 전달)을 그대로 가져온다.
 *
 * [Usage]
 * ```tsx
 * <TaskBoard tasks={tasks} toggleTaskAction={toggleTask} />
 * ```
 * ---------------------------------------------
 */

export async function toggleTask(formData: FormData): Promise<void> {
  await requireConsent();

  const taskId = formData.get("taskId");
  const done = formData.get("done") === "true";

  if (typeof taskId === "string" && taskId) {
    try {
      await setTaskDone(taskId, done);
    } catch {
      // 남의 카드 id 를 보냈거나 이미 지워진 카드다. 조용히 되돌아간다.
    }
  }

  redirect("/dashboard");
}
