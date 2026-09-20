import { Badge } from "@/components/shared/Badge";
import type { TaskReason } from "@/features/cultivations/domain/aiTasks";
import {
  pickedHref,
  withPicked,
} from "@/features/cultivations/domain/pickedTasks";
import type { TaskAdvice } from "@/shared/growth/taskAdvice";

/**
 * ---------------------------------------------
 * [Feature]: 이번 주 할 일 목록
 *
 * [Description]
 * - **판정은 ai-service 가 한다** — 홈 카드와 **같은 함수**다
 *   (`app/domain/task_rules.py`). 화면 쪽 규칙(`shared/growth/taskAdvice.ts`)이
 *   따로 판정하던 때는 임계값이 갈려 반대되는 조언이 나갔다. 여기는 그리기만 한다.
 * - ⚠️ **약제 이름과 희석배수는 나오지 않는다.** 규칙 쪽에서 막는다 — 틀리면
 *   작물이 죽고, 우리는 그 책임을 질 위치가 아니다.
 * - **`했음` 은 저장하지 않는다**(2026-09-21 뒤집음). 카드를 관찰 기록으로
 *   옮겨 담기만 하고, 실제로 남는 것은 거기서 `기록 남기기` 를 눌렀을 때다.
 *   잘못 눌러도 그쪽의 `취소` 로 되돌아온다.
 * - **버튼이 아니라 링크다.** 담아 둔 상태는 URL 쿼리에 산다(`?picked=`).
 *   상태를 컴포넌트가 들면 Client Component 가 되는데, 이 화면은 **JS 가 0줄**인
 *   것이 성질이다. 주소만 바꾸면 서버가 다시 그려 준다.
 * - 담은 카드는 이 목록에서 빠진다 — 옮겨 갔으니 두 곳에 있으면 안 된다.
 *   그날 이미 저장된 카드를 빼는 것은 따로다(`domain/doneTasks.ts`, 읽을 때).
 * ---------------------------------------------
 */

export interface TaskAdviceListProps {
  tasks: readonly TaskAdvice[];
  /** 지금 관찰 기록에 담겨 있는 카드 제목들. 여기서는 빠진다. */
  picked: readonly string[];
  /** 0장일 때 **왜** 인지. 셋을 한 말로 뭉개면 정상인 밭에 거짓말이 나간다. */
  reason: TaskReason;
}

/**
 * 0장일 때 할 말.
 *
 * ★ 2026-09-20 — 전에는 무조건 "생육 단계를 판정하지 못해…" 였다. 상추처럼
 *   단계가 멀쩡한데 오늘 조건이 없어 0장인 밭에도 그 말이 나갔다.
 *   ai-service 가 *"0건이 정상인 유일한 경로"* 와 건너뜀을 애써 갈라 놓았는데
 *   (`service/plot_tasks.py`) 화면이 도로 뭉갠 것이다.
 */
const EMPTY_KO: Record<TaskReason, string> = {
  ok: "오늘은 따로 할 일이 없습니다.",
  // 단계표가 없거나 기준온도·목표GDD 가 비어 있다. 자료가 채워져야 풀린다
  "no-stage": "이 작물은 생육 단계 자료가 없어 할 일을 내지 못합니다.",
  failed: "할 일을 불러오지 못했습니다. 새로 고쳐 주세요.",
};

const TONE = {
  info: "neutral",
  caution: "caution",
  unsuitable: "unsuitable",
} as const;

export function TaskAdviceList({ tasks, picked, reason }: TaskAdviceListProps) {
  if (tasks.length === 0) {
    return <p className="text-fg-muted text-sm">{EMPTY_KO[reason]}</p>;
  }

  const left = tasks.filter((task) => !picked.includes(task.titleKo));
  if (left.length === 0) {
    return (
      <p className="text-fg-muted text-sm">
        할 일을 모두 담았습니다. 아래 관찰 기록에서 남겨 주세요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {left.map((task) => (
        <li
          className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3"
          key={task.id}
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

          <a
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-fg text-sm hover:bg-surface-2"
            href={pickedHref(withPicked(picked, task.titleKo))}
          >
            했음
          </a>
        </li>
      ))}
    </ul>
  );
}
