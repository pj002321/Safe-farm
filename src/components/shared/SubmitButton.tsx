"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/shared/Button";

/**
 * ---------------------------------------------
 * [Feature]: Server Action 폼의 제출 버튼 (연타 방지)
 *
 * [Description]
 * - `<form action={serverAction}>` 은 버튼을 눌린 채로 두지 않는다. 액션이 도는
 *   동안 다시 누르면 **그만큼 POST 가 더 나간다** — 작물 추가를 세 번 연타하면
 *   같은 작물이 세 건 생겼다. `useFormStatus()` 의 `pending` 으로 그 사이 버튼을
 *   막는다.
 * - 이 훅은 **폼 안의 자식 컴포넌트에서만** 값을 받는다. 폼과 같은 컴포넌트에서
 *   부르면 늘 false 라, 버튼을 따로 떼어 낸 이유가 그것이다.
 * - `"use client"` 는 여기까지다. 폼과 그 안의 입력은 서버 컴포넌트로 남는다.
 * - JS 가 없으면 연타가 그대로 나간다. 그건 서버가 막을 몫이고, 여기서 하는 것은
 *   사람이 실제로 겪는 경로를 막는 일이다.
 *
 * [Usage]
 * ```tsx
 * <form action={addCultivations}>
 *   <SubmitButton pendingKo="추가하는 중">추가</SubmitButton>
 * </form>
 * ```
 * ---------------------------------------------
 */

interface SubmitButtonProps
  extends Omit<ComponentProps<typeof Button>, "type" | "loading"> {
  /** 제출 중에 보여 줄 글자. 없으면 원래 글자를 그대로 둔다. */
  pendingKo?: string;
}

export function SubmitButton({
  children,
  pendingKo,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button loading={pending} type="submit" {...props}>
      {pending && pendingKo ? pendingKo : children}
    </Button>
  );
}
