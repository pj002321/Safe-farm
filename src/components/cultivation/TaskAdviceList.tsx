import { Badge } from "@/components/shared/Badge";
import { SubmitButton } from "@/components/shared/SubmitButton";
import type { TaskAdvice } from "@/shared/growth/taskAdvice";

/**
 * ---------------------------------------------
 * [Feature]: 이번 주 할 일 목록
 *
 * [Description]
 * - 생육단계와 최근 기상에서 나온 추천이다. 규칙은 `shared/growth/taskAdvice.ts`
 *   가 갖고, 여기는 그리기만 한다.
 * - ⚠️ **약제 이름과 희석배수는 나오지 않는다.** 규칙 쪽에서 막는다 — 틀리면
 *   작물이 죽고, 우리는 그 책임을 질 위치가 아니다.
 * - "했음" 버튼은 기록만 남긴다(`TASK_DONE`). 추천은 매번 다시 계산되는 값이라
 *   체크 상태를 저장할 대상 자체가 없다.
 * ---------------------------------------------
 */

export interface TaskAdviceListProps {
  tasks: readonly TaskAdvice[];
  plotId: string;
  cultivationId: string;
  /** 끝난 재배는 버튼을 숨긴다. 기록할 작업이 더 없다. */
  readOnly?: boolean;
  onDone: (formData: FormData) => Promise<void>;
}

const TONE = {
  info: "neutral",
  caution: "caution",
  unsuitable: "unsuitable",
} as const;

export function TaskAdviceList({
  tasks,
  plotId,
  cultivationId,
  readOnly = false,
  onDone,
}: TaskAdviceListProps) {
  if (tasks.length === 0) {
    return (
      <p className="text-fg-muted text-sm">
        생육 단계를 판정하지 못해 할 일을 내지 못했습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-fg">{task.titleKo}</span>
              {task.tone !== "info" && (
                <Badge size="sm" tone={TONE[task.tone]}>
                  주의
                </Badge>
              )}
            </div>
            <p className="text-fg-muted text-sm">{task.whyKo}</p>
          </div>

          {!readOnly && (
            <form action={onDone}>
              <input name="plotId" type="hidden" value={plotId} />
              <input name="cultivationId" type="hidden" value={cultivationId} />
              <input name="titleKo" type="hidden" value={task.titleKo} />
              <SubmitButton
                pendingKo="기록하는 중"
                size="sm"
                variant="secondary"
              >
                했음
              </SubmitButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
