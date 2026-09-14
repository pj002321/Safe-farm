"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthError } from "@/components/auth/AuthError";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from "@/components/icons";
import { Button } from "@/components/shared/Button";
import { Field } from "@/components/shared/Field";
import { signInWithEmail } from "@/shared/auth/supabaseSignIn";

/**
 * ---------------------------------------------
 * [Feature]: 로그인 입력 폼
 *
 * [Description]
 * - **Server Action 이 아니라 `onSubmit` 이다.** Firebase Auth 는 비밀번호를
 *   서버에서 검증할 수 없어서, 인증 자체가 브라우저 SDK 로 내려왔다. 그 대가로
 *   JS 없이 동작하던 폼은 유지할 수 없다 — 플랫폼이 강제하는 제약이다.
 *   대신 세션 쿠키는 서버가 굽고, 보호 경로는 전부 서버가 다시 검증한다.
 * - `useFormStatus()` 는 Server Action 전용이라 더 쓰지 않는다. pending 을 직접
 *   들고, 그 값으로 버튼을 잠가 연타를 막는다(`Button` 이 loading 시 disabled).
 * - 실패는 이 폼 **안에서** `role="alert"` 로 보여준다. 예전처럼 `?error=` 로
 *   왕복하면 입력값이 날아가고 주소창에 실패 흔적이 남는다.
 * - 성공 후 `router.refresh()` 가 반드시 필요하다. 없으면 서버 컴포넌트가
 *   캐시된 비로그인 상태를 계속 보여줘 "로그인했는데 그대로"로 보인다.
 *
 * [Usage]
 * ```tsx
 * <LoginForm next="/dashboard" />
 * ```
 * ---------------------------------------------
 */

export function LoginForm({ next }: { next: string }) {
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    // 비제어 입력에서 값을 읽는다. 글자마다 리렌더할 이유가 없는 폼이다.
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const result = await signInWithEmail(
      String(form.get("email") ?? ""),
      String(form.get("password") ?? ""),
    );

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    // 성공하면 pending 을 풀지 않는다. 화면이 넘어가는 동안 버튼이 다시 살아나
    // 한 번 더 눌리는 일을 막는다.
    router.replace(next);
    router.refresh();
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <AuthError message={error} />

      <Field
        autoComplete="email"
        icon={<MailIcon />}
        label="이메일"
        name="email"
        required
        type="email"
      />

      <div className="flex flex-col gap-2">
        <Field
          autoComplete="current-password"
          icon={<LockIcon />}
          label="비밀번호"
          name="password"
          required
          type={revealed ? "text" : "password"}
        />

        {/*
          토글을 입력칸 **안에** 겹쳐 놓지 않았다. Field 의 내부 여백을 바깥에서
          추측해 절대배치하면, Field 가 바뀔 때마다 이 버튼만 조용히 어긋난다.
          아래 줄에 두면 터치 영역도 넉넉하고 포커스 순서도 자연스럽다.
        */}
        <button
          aria-label={revealed ? "비밀번호 숨기기" : "비밀번호 표시"}
          aria-pressed={revealed}
          className="inline-flex items-center gap-1.5 self-end rounded-sm text-fg-muted text-xs transition-colors hover:text-fg"
          onClick={() => setRevealed(!revealed)}
          type="button"
        >
          {revealed ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
          {revealed ? "숨기기" : "표시"}
        </button>
      </div>

      <Button
        fullWidth
        iconEnd={<ArrowRightIcon />}
        loading={pending}
        type="submit"
      >
        {pending ? "확인하는 중" : "로그인"}
      </Button>
    </form>
  );
}
