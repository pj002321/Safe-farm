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
  SproutIcon,
} from "@/components/icons";
import { Button } from "@/components/shared/Button";
import { Field } from "@/components/shared/Field";
import type { Consent } from "@/shared/auth/consent";
import { signUpWithEmail } from "@/shared/auth/firebaseSignIn";
import { DEFAULT_AFTER_LOGIN } from "@/shared/auth/redirect";

/**
 * ---------------------------------------------
 * [Feature]: 이메일 회원가입 폼
 *
 * [Description]
 * - **Server Action 이 아니라 `onSubmit` 이다.** Firebase 는 계정 생성도 브라우저
 *   SDK 가 한다(서버에는 비밀번호를 넘길 방법 자체가 없다). 그 결과로 얻은
 *   ID 토큰을 세션 라우트에 넘겨 쿠키를 굽는 뒷부분은 `signUpWithEmail` 안에 있다.
 * - 동의는 이제 hidden input 이 아니라 **인자**로 넘어간다. 예전에는 한 `<input>` 이
 *   한 `<form>` 에만 속하는 제약 때문에 두 폼이 같은 값을 각각 실어야 했는데,
 *   호출이 자바스크립트 함수가 된 지금은 그냥 값을 건네면 된다.
 * - 여기의 `required` · `minLength` 는 왕복을 아껴 주는 편의일 뿐 **신뢰 경계가
 *   아니다.** 동의 판정은 세션 라우트가 `isConsentComplete` 로 다시 한다.
 * - 비밀번호 확인 칸을 두지 않았다. 표시 토글이 있으면 오타는 눈으로 잡히고,
 *   확인 칸은 붙여넣기로 우회되어 실제 오타를 잡아 주지 못한다.
 *
 * [Usage]
 * ```tsx
 * <SignupForm consent={consent} disabled={!ready} />
 * ```
 * ---------------------------------------------
 */

/** Firebase Auth 의 최소 비밀번호 길이. 더 짧으면 `auth/weak-password` 로 거절된다. */
const MIN_PASSWORD_LENGTH = 8;

interface SignupFormProps {
  consent: Consent;
  /** 필수 동의 전에는 제출을 막는다. 방어가 아니라 안내다 — 서버가 다시 본다. */
  disabled: boolean;
}

export function SignupForm({ consent, disabled }: SignupFormProps) {
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || disabled) return;

    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const fullName = String(form.get("fullName") ?? "").trim();
    const result = await signUpWithEmail({
      consent,
      email: String(form.get("email") ?? "").trim(),
      // 빈 문자열을 보내면 프로필의 이름을 빈 값으로 덮어쓴다. 아예 빼서
      // "값 없음"과 "빈 이름"을 구분한다.
      fullName: fullName || undefined,
      password: String(form.get("password") ?? ""),
    });

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    // 가입 직후 이미 로그인 상태다(확인 메일을 기다리는 단계가 없다).
    // refresh() 가 없으면 서버 컴포넌트가 옛 비로그인 상태를 계속 보여준다.
    router.replace(DEFAULT_AFTER_LOGIN);
    router.refresh();
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <AuthError message={error} />

      <Field
        autoComplete="name"
        hint="리포트 인사말에 쓰입니다. 나중에 바꿀 수 있어요."
        icon={<SproutIcon />}
        label="이름"
        name="fullName"
      />

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
          autoComplete="new-password"
          hint={`${MIN_PASSWORD_LENGTH}자 이상`}
          icon={<LockIcon />}
          label="비밀번호"
          minLength={MIN_PASSWORD_LENGTH}
          name="password"
          required
          type={revealed ? "text" : "password"}
        />

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
        disabled={disabled}
        fullWidth
        iconEnd={<ArrowRightIcon />}
        loading={pending}
        type="submit"
      >
        {pending ? "계정을 만드는 중" : "계정 만들기"}
      </Button>
    </form>
  );
}
