import Link from "next/link";
import { ArrowUpRightIcon, CheckIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import type { PlotTaskGroup } from "@/features/dashboard/domain/taskGrouping";
import type {
  Priority,
  TaskCardData,
} from "@/features/dashboard/domain/taskSummary";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 할 일 — 작업 카드 목록
 *
 * [Description]
 * - **근거 없는 작업은 카드로 만들지 않는다**(스펙). 그래서 `reasonKo` 가 선택이
 *   아니라 필수 필드다. 타입에서 막아 두면 나중에 근거 없는 카드가 끼어들 수 없다.
 * - 완료 체크는 `<form action={toggleTaskAction}>` + 제출 버튼이다. 체크박스처럼
 *   보이지만 실제로는 폼 제출이라 JS 없이도 동작한다 — `plots/actions.ts` 의
 *   삭제 버튼과 같은 패턴. `toggleTaskAction` 은 Server Action 인데, 여기(`src/
 *   components/`)에서 `src/app/` 을 직접 import 하면 의존 방향(shared → features →
 *   app)이 거꾸로 된다. 그래서 `page.tsx` 가 액션을 읽어 prop 으로 내려준다.
 *   **"하단으로 이동"은 로직**이라 여기서는 완료된 카드를 아래 묶음에 따로 그려
 *   그 결과 모습만 보여 준다.
 * - **밭별로 나눠 그린다.** 밭이 둘 이상이면 "이 물 주기가 어느 밭 얘기지"를 카드
 *   마다 읽어야 했다. 묶는 규칙(밭 정렬·빈 밭 처리)은 로직이라
 *   `features/dashboard/domain/taskGrouping.ts` 가 정하고, 여기는 그리기만 한다.
 * - "3건 + 더보기"는 뺐다. 밭별로 갈리면 한 밭당 두세 건이라 접을 이유가 없고,
 *   접으면 오히려 밭마다 여는 동작이 생긴다.
 * - 우선순위를 **색으로만** 구분하지 않는다. 배지에 글자가 함께 들어가야 색을
 *   구분하기 어려운 사용자도 급한 일을 안다.
 *
 * [Usage]
 * ```tsx
 * <TaskBoard groups={groupTasksByPlot(tasks, plots)} toggleTaskAction={toggleTask} />
 * ```
 * ---------------------------------------------
 */

const PRIORITY: Record<
  Priority,
  { labelKo: string; tone: "unsuitable" | "caution" | "neutral" }
> = {
  high: { labelKo: "급함", tone: "unsuitable" },
  mid: { labelKo: "보통", tone: "caution" },
  low: { labelKo: "여유", tone: "neutral" },
};

interface TaskBoardProps {
  /** 밭별로 묶인 오늘의 카드. `groupTasksByPlot` 이 만든다. */
  groups: readonly PlotTaskGroup[];
  /** 완료 체크 제출을 받는 Server Action. page.tsx 가 내려준다. */
  toggleTaskAction: (formData: FormData) => Promise<void>;
}

export function TaskBoard({ groups, toggleTaskAction }: TaskBoardProps) {
  // 밭은 있는데 오늘 할 일이 하나도 없는 경우. 밭별로 "없음"을 늘어놓으면
  // 화면만 길어지므로 한 장으로 합쳐서 알린다.
  if (groups.every((group) => group.open.length + group.done.length === 0)) {
    return <EmptyTasks />;
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <PlotSection
          group={group}
          key={group.plotId}
          toggleTaskAction={toggleTaskAction}
        />
      ))}
    </div>
  );
}

/**
 * 밭 한 곳의 묶음.
 *
 * 할 일이 없는 밭은 **카드 없이 한 줄로 축약한다.** 밭이 다섯이면 빈 카드가
 * 다섯 장 쌓여 정작 할 일이 있는 밭이 스크롤 아래로 밀린다. 그렇다고 아예 빼면
 * 사용자는 밭을 빠뜨린 줄 안다.
 */
function PlotSection({
  group,
  toggleTaskAction,
}: {
  group: PlotTaskGroup;
  toggleTaskAction: (formData: FormData) => Promise<void>;
}) {
  const quiet = group.open.length === 0 && group.done.length === 0;

  return (
    <section aria-labelledby={`plot-tasks-${group.plotId}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {/* 밭 이름에서 바로 상세로 간다. 카드를 보다 "이 밭 상태가 어떻지"가
            자연스럽게 따라오는 동선이다. */}
        <Link
          className="font-semibold text-fg text-sm hover:text-accent hover:underline underline-offset-2"
          href={`/plots/${group.plotId}`}
          id={`plot-tasks-${group.plotId}`}
        >
          {group.plotKo}
        </Link>
        <span className="font-mono text-[0.68rem] text-fg-subtle">
          {quiet
            ? "할 일 없음"
            : [
                group.open.length > 0 ? `할 일 ${group.open.length}` : null,
                group.done.length > 0 ? `완료 ${group.done.length}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </div>

      {quiet ? null : (
        <div className="flex flex-col gap-2.5">
          {group.open.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              toggleTaskAction={toggleTaskAction}
            />
          ))}
          {group.done.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              toggleTaskAction={toggleTaskAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 카드가 하나도 없을 때.
 *
 * 빈 배열을 그대로 두면 "오늘 할 일" 밑이 그냥 빈 공간이라 서비스가 멈춘
 * 것처럼 보인다(빈 상태 없는 `PlotStrip` 이 같은 이유로 온보딩을 그리는 것과
 * 같은 문제). 판정은 매일·밭마다 실제로 도는 것이니, "확인했고 지금은 없다"를
 * 눈에 보이는 카드 한 장으로 알려준다.
 */
function EmptyTasks() {
  return (
    <div className="rounded-lg border border-border border-dashed bg-surface-2/40 px-6 py-8 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-telemetry text-accent-on">
        <CheckIcon strokeWidth={3} />
      </span>
      <p className="mt-3 font-semibold text-fg text-sm">
        오늘은 특별히 할 일이 없습니다
      </p>
      <p className="mx-auto mt-1.5 max-w-xs text-balance text-fg-muted text-xs leading-relaxed">
        강수량과 생육 단계를 매일 다시 판정합니다. 조건이 바뀌면 그 즉시 카드로
        알려 드릴게요.
      </p>
    </div>
  );
}

/**
 * 카드 한 장. 이전 기록 화면(`dashboard/history`)도 이걸 그대로 쓴다 —
 * 그쪽은 "3건 + 더보기"도, "오늘은 할 일이 없습니다" 빈 상태도 맞지 않아
 * 목록 구성만 따로 하고 카드는 공유한다.
 */
export function TaskCard({
  task,
  toggleTaskAction,
}: {
  task: TaskCardData;
  toggleTaskAction: (formData: FormData) => Promise<void>;
}) {
  const priority = PRIORITY[task.priority];

  return (
    // 체크박스가 아니라 실제 완료 여부(task.done)로 흐림 처리한다 — 더 이상
    // :checked 의사 클래스가 아니라 서버가 내려준 값을 그린다.
    <article
      className={`rounded-lg border border-border bg-surface p-4 transition-[opacity,border-color] duration-200 ease-out-expo ${task.done ? "opacity-55" : ""}`}
    >
      <div className="flex items-start gap-3">
        <form action={toggleTaskAction} className="mt-0.5 shrink-0">
          <input name="taskId" type="hidden" value={task.id} />
          <input name="done" type="hidden" value={(!task.done).toString()} />
          <button
            aria-pressed={task.done}
            className={`grid size-[1.375rem] place-items-center rounded-full border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${task.done ? "border-telemetry bg-telemetry text-accent-on" : "border-border-strong bg-surface text-transparent"}`}
            type="submit"
          >
            <span className="sr-only">{task.titleKo} 완료 표시</span>
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </button>
        </form>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold text-[0.98rem] text-fg leading-snug">
              {task.titleKo}
            </h3>
            <Badge size="sm" tone={priority.tone}>
              {priority.labelKo}
            </Badge>
            {/* 이월된 미완료에만 붙인다. 오늘 생긴 카드(daysOpen 0)에 "1일째"를
                붙이면 전부 배지를 달게 되어 구분이 사라진다. 완료 카드에도 안
                붙인다 — 끝난 일이 며칠 걸렸는지는 여기서 할 얘기가 아니다. */}
            {/* 배치가 닫은 카드. 이력 화면에만 나타난다 — 홈은 살아 있는 카드만
                보여 준다. "며칠째"와 같이 붙이지 않는다: 이미 끝난 일에 경과일을
                세는 것은 의미가 없고, 배지가 둘이면 어느 쪽이 상태인지 흐려진다. */}
            {task.expired ? (
              <Badge size="sm" tone="neutral">
                안 함
              </Badge>
            ) : (
              !task.done &&
              task.daysOpen > 0 && (
                <Badge size="sm" tone="neutral">
                  {task.daysOpen + 1}일째
                </Badge>
              )
            )}
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
