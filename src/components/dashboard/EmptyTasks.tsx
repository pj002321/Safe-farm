import Link from "next/link";
import { AlertTriangleIcon, CheckIcon } from "@/components/icons";
import type { EmptyTaskReason } from "@/features/dashboard/domain/emptyTaskReason";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 할 일이 하나도 없을 때의 화면
 *
 * [Description]
 * - **"없다"와 "못 냈다"를 가른다.** 예전에는 둘 다 "오늘은 특별히 할 일이
 *   없습니다"였다. 파종일을 안 넣어 판정 자체를 못 한 경우에도 같은 문구가 떠서,
 *   사용자는 확인이 끝난 줄 알고 기다렸다.
 * - 판정을 못 한 경우에는 **무엇이 없고 무엇을 하면 되는지**와 그 자리로 가는
 *   링크를 함께 준다. 어느 쪽인지 정하는 것은 로직이라
 *   `features/dashboard/domain/emptyTaskReason.ts` 가 하고 여기는 그리기만 한다.
 * - `TaskBoard` 에서 떼어냈다. 문구 분기가 붙으면서 그 파일이 300줄을 넘었고,
 *   빈 상태는 카드 목록과 책임이 다르다.
 * ---------------------------------------------
 */

export function EmptyTasks({ reason }: { reason: EmptyTaskReason }) {
  // 판정이 정상적으로 끝나고 할 일이 없는 경우. **이때만** 확인이 끝났다고 말한다.
  if (reason.kind === "nothing-to-do") {
    return (
      <EmptyShell
        icon={<CheckIcon strokeWidth={3} />}
        titleKo="오늘은 특별히 할 일이 없습니다"
      >
        강수량과 생육 단계를 매일 다시 판정합니다. 조건이 바뀌면 그 즉시 카드로
        알려 드릴게요.
      </EmptyShell>
    );
  }

  // 아래는 **판정을 못 한** 경우다. 예전에는 위 문구를 똑같이 띄웠는데, 그러면
  // 사용자는 확인이 끝난 줄 알고 기다린다. 무엇이 없고 무엇을 하면 되는지 말한다.
  const { plotId, plotKo } = reason;
  const isNoCultivation = reason.kind === "no-cultivation";

  return (
    <EmptyShell
      icon={<AlertTriangleIcon />}
      tone="caution"
      titleKo={
        isNoCultivation
          ? `${plotKo}에 기르는 작물이 없습니다`
          : `${plotKo}의 파종일이 비어 있습니다`
      }
    >
      {isNoCultivation
        ? "무엇을 심었는지 알아야 물·거름 시기를 판정할 수 있습니다."
        : "언제 심었는지 알아야 생육 단계를 셀 수 있습니다."}
      <Link
        className="mt-3 inline-block font-medium text-accent hover:underline underline-offset-2"
        href={`/plots/${plotId}`}
      >
        {isNoCultivation ? "작물 등록하기" : "파종일 입력하기"} →
      </Link>
    </EmptyShell>
  );
}

/** 빈 상태의 공통 껍데기. 문구만 갈리고 모양은 같다. */
function EmptyShell({
  icon,
  titleKo,
  tone = "neutral",
  children,
}: {
  icon: React.ReactNode;
  titleKo: string;
  tone?: "neutral" | "caution";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border border-dashed bg-surface-2/40 px-6 py-8 text-center">
      <span
        className={`mx-auto grid size-11 place-items-center rounded-full ${
          tone === "caution"
            ? "bg-caution/15 text-caution"
            : "bg-telemetry text-accent-on"
        }`}
      >
        {icon}
      </span>
      <p className="mt-3 font-semibold text-fg text-sm">{titleKo}</p>
      <div className="mx-auto mt-1.5 max-w-xs text-balance text-fg-muted text-xs leading-relaxed">
        {children}
      </div>
    </div>
  );
}
