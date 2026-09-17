import type { Metadata } from "next";
import Link from "next/link";
import { TaskCard } from "@/components/dashboard/TaskBoard";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { activePlotIds } from "@/features/dashboard/domain/taskGrouping";
import { CARRY_OVER_DAYS } from "@/features/dashboard/domain/taskSummary";
import { listTaskHistory } from "@/features/dashboard/taskStore";
import { listPlotCards } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { toggleTask } from "../actions";

/**
 * ---------------------------------------------
 * [Feature]: 이전 할 일 기록  →  /dashboard/history
 *
 * [Description]
 * - 홈에서 빠진 카드를 전부 보여 준다 — 이월 기간(CARRY_OVER_DAYS)을 넘긴 미완료와,
 *   오늘 이전에 끝낸 것. `listTaskCards` 의 **정확한 여집합**이라 두 화면 사이로
 *   새는 카드가 없다.
 * - 화면을 굳이 나눈 이유: 홈은 "지금 해야 할 일"만 보여야 한다. 끝난 일과 오래된
 *   카드가 같이 쌓이면 정작 오늘 할 일이 아래로 밀리고, 그러면 목록 자체를 안 보게
 *   된다. 그렇다고 지우면 "내가 저걸 했던가"를 확인할 방법이 없어진다.
 * - **기록은 수확 전까지만 보여 준다.** 밭의 재배가 전부 수확되면 그 밭의 기록은
 *   내려간다 — 한 철이 끝났는데 다음 작물의 기록과 섞이면 "올해 뭘 했나"를 읽을 수
 *   없다. ⚠️ 감추는 것이지 지우는 것이 아니다. 행은 DB 에 그대로 남는다.
 * - **여기서도 완료 체크가 된다.** 홈에서 내려간 카드를 여기서 끝낼 수 있어야 한다.
 *   홈과 같은 Server Action 을 쓴다. 단 배치가 닫은 카드("안 함")는 이미 끝난
 *   기록이라 되살리는 동작을 두지 않는다 — 조건이 여전하면 새 카드가 이미 떠 있다.
 * - 목록 구성은 `TaskBoard` 를 쓰지 않는다. 그쪽의 "3건 + 더보기"와 "오늘은 할 일이
 *   없습니다" 빈 상태가 이 화면에는 맞지 않는다. 카드 한 장(`TaskCard`)만 공유한다.
 * - `"use client"` 가 없다. 완료 체크는 폼 제출이라 JS 없이 동작한다(홈과 같다).
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "이전 할 일 기록" };

export default async function TaskHistoryPage() {
  const profile = await getCurrentProfile();

  // 홈과 같은 방침이다 — 조회가 실패해도 빈 목록으로 화면을 그린다. 기록 화면이
  // 통째로 500 이 되는 것보다 "지금은 없다"를 보여 주는 편이 낫다. 원인은 로그로.
  let tasks: Awaited<ReturnType<typeof listTaskHistory>> = [];
  if (profile) {
    try {
      const [history, plots] = await Promise.all([
        listTaskHistory(profile.id),
        listPlotCards(profile.id),
      ]);
      const active = activePlotIds(plots);
      tasks = history.filter((task) => active.has(task.plotId));
    } catch (error) {
      console.error("[dashboard] 이전 할 일 기록 조회 실패", error);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 sm:py-8">
      <div>
        <SectionHeading
          description={`끝낸 일과, ${CARRY_OVER_DAYS}일 안에 하지 않아 닫힌 일입니다. 수확하면 그 밭의 기록은 내려갑니다.`}
          eyebrow="history"
          title="이전 할 일 기록"
        />
        <Link
          className="mt-3 inline-block text-fg-muted text-xs underline underline-offset-2 hover:text-fg"
          href="/dashboard"
        >
          ← 홈으로
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-border border-dashed bg-surface-2/40 px-6 py-8 text-center text-fg-muted text-sm">
          아직 지난 기록이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} toggleTaskAction={toggleTask} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
