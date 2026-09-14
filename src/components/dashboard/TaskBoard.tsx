import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
} from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import type { Priority, TaskCardData } from "./sample";

/**
 * ---------------------------------------------
 * [Feature]: 주말 할 일 — 작업 카드 목록 (마크업 전용)
 *
 * [Description]
 * - **근거 없는 작업은 카드로 만들지 않는다**(스펙). 그래서 `reasonKo` 가 선택이
 *   아니라 필수 필드다. 타입에서 막아 두면 나중에 근거 없는 카드가 끼어들 수 없다.
 * - 완료 체크는 네이티브 `<input type="checkbox">` 다. 체크하면 CSS 로 카드가
 *   흐려지고 제목에 취소선이 들어간다 — 상태를 JS 로 들고 있지 않아도 되고,
 *   키보드·스크린리더가 공짜로 따라온다. **"하단으로 이동"은 로직**이라 여기서는
 *   완료된 카드를 아래 묶음에 따로 그려 그 결과 모습만 보여 준다.
 * - 기본 3건 + 더보기도 **마크업만**이다. `<details>` 로 열고 닫아 JS 없이
 *   동작하게 했다 — 퍼블 단계에서 열린 모습과 닫힌 모습을 둘 다 볼 수 있다.
 * - 우선순위를 **색으로만** 구분하지 않는다. 배지에 글자가 함께 들어가야 색을
 *   구분하기 어려운 사용자도 급한 일을 안다.
 *
 * [Usage]
 * ```tsx
 * <TaskBoard tasks={SAMPLE_TASKS} />
 * ```
 * ---------------------------------------------
 */

/** 기본으로 펼쳐 둘 개수. 스펙의 "기본 3건 표시 후 더보기". */
const VISIBLE_COUNT = 3;

const PRIORITY: Record<
  Priority,
  { labelKo: string; tone: "unsuitable" | "caution" | "neutral" }
> = {
  high: { labelKo: "급함", tone: "unsuitable" },
  mid: { labelKo: "보통", tone: "caution" },
  low: { labelKo: "여유", tone: "neutral" },
};

interface TaskBoardProps {
  tasks: readonly TaskCardData[];
}

export function TaskBoard({ tasks }: TaskBoardProps) {
  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  const shown = open.slice(0, VISIBLE_COUNT);
  const rest = open.slice(VISIBLE_COUNT);

  return (
    <div className="flex flex-col gap-3">
      {shown.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}

      {rest.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border border-dashed py-2.5 font-medium text-fg-muted text-sm transition-colors hover:border-accent hover:text-accent">
            {/* 열리면 화살표가 뒤집힌다. 여는 쪽인지 닫는 쪽인지 형태로 알린다. */}
            <ChevronDownIcon className="transition-transform group-open:rotate-180" />
            할 일 {rest.length}건 더 보기
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {rest.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </details>
      )}

      {done.length > 0 && (
        <section className="mt-2 border-border border-t pt-4">
          <h3 className="font-mono text-[0.65rem] text-fg-subtle uppercase tracking-[0.14em]">
            오늘 끝낸 일 {done.length}
          </h3>
          <div className="mt-3 flex flex-col gap-3">
            {done.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: TaskCardData }) {
  const priority = PRIORITY[task.priority];

  return (
    // has-[:checked]: 로 카드 전체가 흐려진다. peer-* 는 형제에만 닿아서
    // 카드 안쪽 요소까지 한 번에 바꾸려면 has 쪽이 맞다.
    <article className="rounded-lg border border-border bg-surface p-4 transition-[opacity,border-color] duration-200 ease-out-expo has-[:checked]:border-border has-[:checked]:opacity-55">
      <div className="flex items-start gap-3">
        <label className="mt-0.5 shrink-0 cursor-pointer">
          <span className="sr-only">{task.titleKo} 완료 표시</span>
          <input
            className="peer sr-only"
            defaultChecked={task.done}
            type="checkbox"
          />
          <span className="grid size-[1.375rem] place-items-center rounded-full border border-border-strong bg-surface text-transparent transition-colors duration-150 peer-checked:border-telemetry peer-checked:bg-telemetry peer-checked:text-accent-on peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2">
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </span>
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold text-[0.98rem] text-fg leading-snug">
              {task.titleKo}
            </h3>
            <Badge size="sm" tone={priority.tone}>
              {priority.labelKo}
            </Badge>
            <span className="font-mono text-[0.68rem] text-fg-subtle">
              {task.plotKo}
            </span>
          </div>

          {/* 근거. 이 한 줄이 없으면 카드 자체가 만들어지지 않는다. */}
          <p className="mt-1.5 text-[0.86rem] text-fg-muted leading-relaxed">
            {task.reasonKo}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <button
              className="rounded-sm font-medium text-accent text-xs underline underline-offset-4 transition-colors hover:text-accent-hover"
              type="button"
            >
              작업 방법 보기
            </button>
            {task.sourceKo && (
              <span className="inline-flex items-center gap-1 text-fg-subtle text-xs">
                <ArrowUpRightIcon className="size-3" />
                {task.sourceKo}
              </span>
            )}
            {task.doneAtKo && (
              <span className="font-mono text-[0.68rem] text-telemetry">
                {task.doneAtKo} 완료
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
