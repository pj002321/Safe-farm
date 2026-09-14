"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleIcon } from "@/components/icons";
import { Button } from "@/components/shared/Button";
import type { Consent } from "@/shared/auth/consent";
import { signInWithGoogle } from "@/shared/auth/firebaseSignIn";
import { AuthError } from "./AuthError";

/**
 * ---------------------------------------------
 * [Feature]: 구글 간편 로그인 버튼
 *
 * [Description]
 * - 로그인 화면과 가입 화면이 **같은 버튼**을 쓴다. 구글에서는 로그인과 가입이
 *   같은 동작이기 때문이다 — 계정이 없으면 그 자리에서 만들어진다.
 * - 더 이상 `<form>` 이 아니다. `signInWithPopup` 은 **페이지를 떠나지 않으므로**
 *   폼 제출도, OAuth 리다이렉트도, 동의를 실어 나르던 쿠키도 필요 없다.
 *   동의 값은 그냥 인자로 넘긴다.
 * - `consent` 를 받으면 가입 경로로 간주해 함께 보내고, 없으면 기존 사용자의
 *   로그인 경로다. **판정은 서버가 다시 한다** — 여기서 버튼을 비활성화하는 건
 *   안내일 뿐 방어가 아니다.
 * - 팝업 차단·사용자 취소도 실패로 돌아오지만 붉은 경고가 아니라 "다음에 무엇을
 *   하면 되는지"를 알려주는 문구다(문구 매핑은 firebaseSignIn.ts 가 가진다).
 * - 브랜드 표기는 "Google 계정으로 계속하기". 구글 가이드라인이 로그인/가입을
 *   구분하지 말고 중립적인 문구를 쓰도록 권한다 — 실제로 두 동작을 겸하기 때문이다.
 *
 * [Usage]
 * ```tsx
 * <GoogleSignInButton next="/dashboard" />
 * <GoogleSignInButton next="/dashboard" consent={consent} disabled={!ready} />
 * ```
 * ---------------------------------------------
 */

interface GoogleSignInButtonProps {
  /** 성공 후 돌아갈 내부 경로. 부르는 쪽이 safeNextPath 로 이미 좁힌 값이다. */
  next: string;
  /** 가입 화면에서만 넘긴다. 있으면 동의 값이 함께 기록된다. */
  consent?: Consent;
  disabled?: boolean;
}

export function GoogleSignInButton({
  next,
  consent,
  disabled = false,
}: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    const result = await signInWithGoogle(consent);

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    // refresh() 가 없으면 서버 컴포넌트가 옛 비로그인 상태를 계속 보여준다.
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <AuthError message={error} />

      <Button
        disabled={disabled}
        fullWidth
        icon={<GoogleIcon className="size-[1.125rem]" />}
        loading={pending}
        onClick={handleClick}
        size="lg"
        variant="secondary"
      >
        {pending ? "구글 계정 확인 중" : "Google 계정으로 계속하기"}
      </Button>
    </div>
  );
}

/**
 * "또는" 구분선. 소셜 로그인과 이메일 폼 사이에만 쓰는 좁은 용도라
 * 공용 프리미티브로 올리지 않고 여기 둔다.
 */
export function AuthDivider() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-fg-subtle text-xs uppercase tracking-[0.18em]">
        또는
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
