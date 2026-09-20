"use client";

import { useFormStatus } from "react-dom";
import { ArrowRightIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 등록 마법사 마지막 단계 제출 버튼 (연타 방지)
 *
 * [Description]
 * - `WizardNav` 의 제출 버튼은 모양이 `Button`/`SubmitButton` 과 달라 그대로
 *   못 쓴다. `useFormStatus()` 만 떼어 내 이 작은 클라이언트 컴포넌트로 만들고,
 *   `WizardNav` 자체는 서버 컴포넌트로 남긴다(`SubmitButton.tsx` 와 같은 이유).
 * ---------------------------------------------
 */

export function WizardSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-accent-on text-base transition-colors duration-200 ease-out-expo hover:bg-accent-hover disabled:opacity-55"
      disabled={pending}
      type="submit"
    >
      {pending ? "등록하는 중" : "텃밭 등록하기"}
      <ArrowRightIcon />
    </button>
  );
}
