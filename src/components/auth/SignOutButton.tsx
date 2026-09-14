"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { signOutEverywhere } from "@/shared/auth/firebaseSignIn";

/**
 * ---------------------------------------------
 * [Feature]: 로그아웃 버튼
 *
 * [Description]
 * - 로그아웃은 더 이상 Server Action 이 아니다. 서버 쿠키만 지우면 브라우저
 *   SDK 는 여전히 로그인 상태라, 다음 인증 시도가 이전 계정으로 조용히 이어진다.
 *   양쪽을 함께 끊는 일은 브라우저에서만 할 수 있으므로 클라이언트 컴포넌트다.
 * - `refresh()` 가 반드시 뒤따라야 한다. 없으면 서버 컴포넌트가 캐시된 로그인
 *   상태(헤더의 이메일 등)를 그대로 계속 보여준다.
 * - 헤더와 대시보드 두 곳이 같은 버튼을 쓴다. 각자 만들면 한쪽만 고쳐진다.
 *
 * [Usage]
 * ```tsx
 * <SignOutButton />
 * <SignOutButton size="sm" variant="ghost" />
 * ```
 * ---------------------------------------------
 */

interface SignOutButtonProps {
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "secondary" | "outline";
}

export function SignOutButton({
  size = "sm",
  variant = "ghost",
}: SignOutButtonProps) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setPending(true);
    await signOutEverywhere();
    // 로그아웃 후에는 공개 랜딩으로 보낸다. /login 으로 보내면 "나가려고 눌렀는데
    // 다시 로그인하라고 하는" 화면이 된다.
    router.replace("/");
    router.refresh();
  };

  return (
    <Button
      loading={pending}
      onClick={handleClick}
      size={size}
      variant={variant}
    >
      {pending ? "로그아웃하는 중" : "로그아웃"}
    </Button>
  );
}
