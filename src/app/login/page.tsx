import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  AuthDivider,
  GoogleSignInButton,
} from "@/components/auth/GoogleSignInButton";
import { safeNextPath } from "@/shared/auth/redirect";
import { LoginForm } from "./LoginForm";

/**
 * ---------------------------------------------
 * [Feature]: 로그인  →  /login
 *
 * [Description]
 * - proxy 가 미로그인 요청을 여기로 보낸다. PUBLIC_PREFIXES 에 포함돼 있어야 한다.
 * - 라우트 그룹 밖에 둔다. 사용자 셸(헤더)을 씌우지 않기 위해서다.
 * - **실패는 더 이상 `?error=` 로 왕복하지 않는다.** 인증이 브라우저에서 일어나
 *   리다이렉트할 이유가 없어졌다. 각 폼이 자기 자리에서 `role="alert"` 로
 *   보여주므로 입력값도 남고 주소창도 깨끗하다.
 * - 구글 버튼을 이메일 폼 **위**에 둔다. 간편 로그인을 쓸 사람이 폼을 지나쳐
 *   내려가지 않게 하는 일반적인 순서다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  // 주소창에서 들어온 값이므로 렌더 전에 내부 경로로 좁힌다. 성공 후
  // `router.replace()` 에 그대로 쓰이므로, 거르지 않으면 열린 리다이렉트가 된다.
  const nextPath = safeNextPath(typeof next === "string" ? next : null);

  return (
    <AuthShell
      description="등록하신 밭의 최신 관측 결과가 기다리고 있습니다."
      footer={
        <p className="mt-8 text-fg-muted text-sm">
          아직 계정이 없으신가요?{" "}
          <Link
            className="text-accent underline underline-offset-4 transition-colors hover:text-accent-hover"
            href="/signup"
          >
            이메일로 가입하기
          </Link>
        </p>
      }
      headline={
        <>
          위성이 지켜보는 동안,
          <br />
          밭은 쉬어도 됩니다.
        </>
      }
      title="다시 오신 걸 환영합니다"
    >
      <div className="mt-8 flex flex-col gap-5">
        <GoogleSignInButton next={nextPath} />
        <AuthDivider />
        <LoginForm next={nextPath} />
      </div>
    </AuthShell>
  );
}
