"use client";

import { useState } from "react";
import { GoogleIcon } from "@/components/icons";
import { Button } from "@/components/shared/Button";
import type { Consent } from "@/shared/auth/consent";
import { signInWithGoogle } from "@/shared/auth/supabaseSignIn";
import { AuthError } from "./AuthError";

/**
 * ---------------------------------------------
 * [Feature]: 구글 간편 로그인 버튼
 *
 * [Description]
 * - 로그인 화면과 가입 화면이 **같은 버튼**을 쓴다. 구글에서는 로그인과 가입이
 *   같은 동작이기 때문이다 — 계정이 없으면 그 자리에서 만들어진다.
 * - ⚠️ **구글 로그인은 페이지를 떠난다.** `signInWithOAuth` 가 내부에서
 *   `window.location.assign(구글주소)` 를 부른다(auth-js `_handleProviderSignIn`).
 *   그런데 **성공을 정상 반환한다** — 떠나는 중에도 뒷줄이 계속 실행된다.
 *   그래서 이 뒤에서 `router.replace()` 를 부르면 안 된다. 같은 틱의 클라이언트
 *   내비게이션이 예약된 location 이동을 **가로채고**, 아직 세션이 없는 상태로
 *   `/dashboard` 를 요청해 proxy 가 `/login` 으로 307 한다. 증상은 "구글 로그인을
 *   눌렀는데 로그인 화면으로 돌아오고, 한 번 더 해야 들어가진다"로 나타난다.
 *   (파이어베이스의 `signInWithPopup` 은 페이지를 떠나지 않아서 이 줄이 필요했다.
 *    공급자가 바뀌며 전제가 뒤집혔는데 코드가 남아 있었다.)
 * - 돌아오는 곳은 `/auth/callback` 이고, 거기서 세션을 만든 뒤 `next` 로 보낸다.
 *   **그래서 이 컴포넌트는 이동을 직접 하지 않는다.**
 * - `consent` 를 받으면 가입 경로로 간주해 함께 보내고, 없으면 기존 사용자의
 *   로그인 경로다. **판정은 서버가 다시 한다** — 여기서 버튼을 비활성화하는 건
 *   안내일 뿐 방어가 아니다.
 * - 실패는 **떠나기 전**(설정 누락 등)에만 돌아온다. 사용자가 구글 화면에서
 *   취소한 경우는 여기가 아니라 `/auth/callback` 이 받는다.
 *   (문구 매핑은 supabaseSignIn.ts 의 `toMessage` 가 가진다.)
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

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    // next 를 함께 넘긴다. 빠뜨리면 콜백이 `?next=` 없이 돌아와 사용자가
    // 어디로 가려 했든 항상 기본 목적지로 떨어진다.
    const result = await signInWithGoogle(consent, next);

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    // 여기서 이동하지 않는다. 브라우저는 이미 구글로 떠나는 중이다(위 주석 참고).
    // pending 을 켜 둔 채로 두어 화면이 언로드될 때까지 로딩 상태를 유지한다.
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
