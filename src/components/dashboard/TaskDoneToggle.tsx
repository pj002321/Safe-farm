"use client";

import { useFormStatus } from "react-dom";
import { CheckIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 할 일 완료 토글 버튼 (연타 방지)
 *
 * [Description]
 * - `TaskCard` 의 원형 체크 버튼은 `Button`/`SubmitButton` 과 모양이 달라 그대로
 *   못 쓴다. `useFormStatus()` 만 떼어 내 이 작은 클라이언트 컴포넌트로 만들고,
 *   `TaskCard` 자체는 서버 컴포넌트로 남긴다(`SubmitButton.tsx` 와 같은 이유).
 * ---------------------------------------------
 */

export function TaskDoneToggle({
  done,
  titleKo,
}: {
  done?: boolean;
  titleKo: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-pressed={done}
      className={`grid size-[1.375rem] place-items-center rounded-full border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-55 ${done ? "border-telemetry bg-telemetry text-accent-on" : "border-border-strong bg-surface text-transparent"}`}
      disabled={pending}
      type="submit"
    >
      <span className="sr-only">{titleKo} 완료 표시</span>
      <CheckIcon className="size-3.5" strokeWidth={3} />
    </button>
  );
}
