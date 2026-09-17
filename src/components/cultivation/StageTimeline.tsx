import type { StageStep } from "@/features/cultivations/domain/stageTimeline";

/**
 * ---------------------------------------------
 * [Feature]: 생육 단계 타임라인
 *
 * [Description]
 * - 전체 단계를 세로로 세우고 지금 단계를 가운데에 둔다. 진행률 막대 하나만
 *   보여 주면 "다음에 뭐가 오나"를 알 수 없어서다.
 * - **도달일을 실측과 추정으로 나눠 적는다.** 관측으로 확인한 날과 앞으로의
 *   추정을 같은 글씨로 쓰면 사용자가 추정을 사실로 읽는다.
 * - 지난 단계는 접어 둔다(`<details>`). 지금·다음 두 줄이 화면의 요점이고,
 *   지난 것은 물었을 때만 있으면 된다.
 * - 서버 컴포넌트다. 상태도 브라우저 API 도 쓰지 않는다.
 * ---------------------------------------------
 */

export interface StageTimelineProps {
  steps: readonly StageStep[];
}

const DOT: Record<StageStep["state"], string> = {
  done: "bg-good",
  current: "bg-accent ring-4 ring-accent/20",
  upcoming: "bg-border",
};

function reachedKo(step: StageStep): string {
  if (step.reachedOn === null) return "도달일 미정";
  return step.reachedKind === "observed"
    ? `${step.reachedOn} 도달`
    : `${step.reachedOn} 예상`;
}

function Row({ step }: { step: StageStep }) {
  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center pt-1.5">
        <span className={`size-2.5 shrink-0 rounded-full ${DOT[step.state]}`} />
        <span className="mt-1 w-px flex-1 bg-border" />
      </span>

      <div className="flex-1 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={
              step.state === "current"
                ? "font-semibold text-fg"
                : "text-fg-muted"
            }
          >
            {step.nameKo}
          </span>
          <span
            className={
              step.reachedKind === "estimated"
                ? "text-fg-subtle text-xs italic"
                : "text-fg-muted text-xs"
            }
          >
            {reachedKo(step)}
          </span>
        </div>

        {step.state === "current" && step.guideKo && (
          <p className="mt-1 text-fg-muted text-sm">{step.guideKo}</p>
        )}
      </div>
    </li>
  );
}

export function StageTimeline({ steps }: StageTimelineProps) {
  if (steps.length === 0) {
    return (
      <p className="text-fg-muted text-sm">
        단계표가 없어 생육 단계를 그릴 수 없습니다.
      </p>
    );
  }

  const done = steps.filter((step) => step.state === "done");
  const rest = steps.filter((step) => step.state !== "done");

  return (
    <div className="flex flex-col gap-2">
      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-muted">
            지난 단계 {done.length}개
          </summary>
          <ul className="mt-3">
            {done.map((step) => (
              <Row key={step.stageOrder} step={step} />
            ))}
          </ul>
        </details>
      )}

      <ul>
        {rest.map((step) => (
          <Row key={step.stageOrder} step={step} />
        ))}
      </ul>
    </div>
  );
}
