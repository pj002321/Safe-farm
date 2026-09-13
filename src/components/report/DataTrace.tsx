import type { StepKind, TraceStep } from "@/features/report/domain/timeline";

/**
 * ---------------------------------------------
 * [Feature]: 데이터 추적 레일 (제목만)
 *
 * [Description]
 * - 리포트가 만들어지는 동안 "지금 무엇을 하고 있는지"를 한 줄씩 쌓는다. 예전에는
 *   API 응답과 수식을 코드 블록으로 다 펼쳤는데, 화면의 주인공이어야 할 기기
 *   프레임보다 덩치가 커져서 **제목과 출처만** 남겼다.
 *   (펼쳐 보여주던 내용은 `timeline.ts` 에 그대로 있다. 다시 보여주고 싶으면
 *    그 데이터를 쓰면 되고, 새로 조사할 필요는 없다.)
 * - 단계 종류를 **색으로만 구분하지 않는다.** 점 색과 함께 출처 글자가 항상 있다 —
 *   색각 이상 사용자에게 색은 신호가 되지 못한다.
 * - 새 줄이 쌓일 때 스크린리더가 따라 읽도록 `aria-live="polite"` 를 건다.
 *   `assertive` 는 읽던 문장을 끊어 오히려 방해가 된다.
 *
 * [Usage]
 * ```tsx
 * <DataTrace steps={TIMELINE} completed={3} />
 * ```
 * ---------------------------------------------
 */

/** 종류별 표시. 색은 보조이고 라벨이 본체다. */
const KIND: Record<StepKind, { labelKo: string; dot: string; text: string }> = {
  fetch: { labelKo: "받아옴", dot: "bg-telemetry", text: "text-telemetry" },
  compute: { labelKo: "계산", dot: "bg-accent", text: "text-accent" },
  write: { labelKo: "저장", dot: "bg-earth", text: "text-earth" },
};

interface DataTraceProps {
  steps: readonly TraceStep[];
  /** 지금까지 끝난 단계 수. 이 개수만큼만 그린다. */
  completed: number;
}

export function DataTrace({ steps, completed }: DataTraceProps) {
  const shown = steps.slice(0, completed);

  return (
    <div className="min-w-0">
      <h2 className="font-mono text-[0.7rem] text-space-muted uppercase tracking-[0.14em]">
        데이터 추적
      </h2>

      <ol aria-live="polite" className="mt-4 min-w-0 space-y-0">
        {shown.map((step, index) => (
          <TraceRow
            isLast={index === shown.length - 1}
            key={step.id}
            step={step}
          />
        ))}
      </ol>

      {shown.length === 0 && (
        <p className="mt-4 font-mono text-[0.72rem] text-space-muted">
          곧 시작합니다…
        </p>
      )}
    </div>
  );
}

function TraceRow({ step, isLast }: { step: TraceStep; isLast: boolean }) {
  const kind = KIND[step.kind];

  return (
    <li
      className={`relative animate-rise border-l pb-4 pl-4 ${
        isLast ? "border-transparent" : "border-space-border"
      }`}
    >
      {/* 점. -left 값은 border(1px) 위에 정확히 겹치도록 맞춘 것이다. */}
      <span
        aria-hidden="true"
        className={`-left-[4px] absolute top-1.5 size-[7px] rounded-full ${kind.dot}`}
      />

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[0.65rem] text-space-muted tabular-nums">
          {String(step.order).padStart(2, "0")}
        </span>
        <span className="font-medium text-[0.85rem] text-space-fg">
          {step.titleKo}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-mono text-[0.65rem] ${kind.text}`}>
          {step.sourceKo}
        </span>
        <span className="font-mono text-[0.65rem] text-space-muted">
          · {kind.labelKo}
        </span>
      </div>
    </li>
  );
}
