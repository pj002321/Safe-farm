import type { StepKind, TraceStep } from "@/features/report/domain/timeline";
import { CodeBlock } from "./CodeBlock";

/**
 * ---------------------------------------------
 * [Feature]: 데이터 추적 패널 (오른쪽)
 *
 * [Description]
 * - 왼쪽 문장 하나하나가 어디서 왔는지 순서대로 쌓아 보여준다. 이 화면의 주장을
 *   말이 아니라 과정으로 증명하는 자리다.
 * - 단계 종류를 **색으로만 구분하지 않는다.** 점 색과 함께 출처 배지의 글자가
 *   항상 있고, 종류 라벨도 텍스트로 둔다 — 색각 이상 사용자에게 색은 신호가 아니다.
 * - 새 단계가 쌓일 때 스크린리더가 따라 읽도록 `aria-live="polite"` 를 건다.
 *   `assertive` 는 읽던 문장을 끊어버려서 오히려 방해가 된다.
 * - 타임라인 세로선은 마지막 항목에서 끊는다. 안 끊으면 선이 허공으로 이어져
 *   "아직 더 있다"는 잘못된 신호를 준다.
 *
 * [Usage]
 * ```tsx
 * <DataTrace steps={TIMELINE} completed={3} />
 * ```
 * ---------------------------------------------
 */

/** 종류별 표시. 색은 보조이고 라벨이 본체다. */
const KIND: Record<StepKind, { labelKo: string; dot: string; text: string }> = {
  fetch: {
    labelKo: "받아온 값",
    dot: "bg-telemetry border-telemetry",
    text: "text-telemetry",
  },
  compute: {
    labelKo: "계산",
    dot: "bg-accent border-accent",
    text: "text-accent",
  },
  write: {
    labelKo: "저장",
    dot: "bg-earth border-earth",
    text: "text-earth",
  },
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
      <h2 className="font-semibold text-base text-space-fg">데이터 추적</h2>
      <p className="mt-1 text-space-muted text-sm leading-relaxed">
        왼쪽 문장이 어디서 왔는지 그대로 적습니다. 받아온 값과 우리가 계산한
        값을 구분해 두었습니다.
      </p>

      <ol aria-live="polite" className="mt-6 min-w-0">
        {shown.map((step, index) => (
          <TraceEntry
            isLast={index === shown.length - 1 && completed >= steps.length}
            key={step.id}
            step={step}
          />
        ))}
      </ol>

      {shown.length === 0 && (
        <p className="rounded-xl border border-space-border border-dashed px-4 py-10 text-center text-space-muted text-sm">
          곧 시작합니다…
        </p>
      )}
    </div>
  );
}

function TraceEntry({ step, isLast }: { step: TraceStep; isLast: boolean }) {
  const kind = KIND[step.kind];

  return (
    <li
      className={`relative min-w-0 animate-rise border-l pb-6 pl-5 ${
        isLast ? "border-transparent" : "border-space-border"
      }`}
    >
      {/* 점. -left 값은 border(1px) 위에 정확히 겹치도록 맞춘 것이다. */}
      <span
        aria-hidden="true"
        className={`-left-[5px] absolute top-1.5 size-2.5 rounded-full border-2 ${kind.dot}`}
      />

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="font-mono text-[0.7rem] text-space-muted tabular-nums">
          {String(step.order).padStart(2, "0")}
        </span>
        <span className="font-semibold text-[0.9rem] text-space-fg">
          {step.titleKo}
        </span>
        <span
          className={`rounded-full border border-space-border px-2 py-0.5 font-mono text-[0.65rem] ${kind.text}`}
        >
          {step.sourceKo}
        </span>
        {step.tagKo && (
          <span className="font-mono text-[0.65rem] text-space-muted">
            {step.tagKo}
          </span>
        )}
        <span className="ml-auto font-mono text-[0.65rem] text-space-muted">
          {kind.labelKo}
        </span>
      </div>

      <div className="mt-2.5 flex min-w-0 flex-col gap-1.5">
        {step.blocks.map((block) => (
          <CodeBlock
            captionKo={block.captionKo}
            key={block.text.slice(0, 24)}
            text={block.text}
          />
        ))}
      </div>

      <p className="mt-2.5 text-[0.8rem] text-space-muted leading-relaxed">
        {step.whyKo}
      </p>
    </li>
  );
}
