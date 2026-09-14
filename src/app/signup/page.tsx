import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupPanel } from "./SignupPanel";

/**
 * ---------------------------------------------
 * [Feature]: 회원가입  →  /signup
 *
 * [Description]
 * - 로그인과 **같은 구글 버튼**을 쓴다. 구글에서는 로그인과 가입이 같은 동작이라
 *   버튼을 나누면 문구만 다른 코드가 둘로 갈라진다.
 * - **"확인 메일을 보냈습니다" 화면이 사라졌다.** Firebase 의 이메일 가입은
 *   계정이 만들어지는 순간 이미 로그인 상태라, 메일을 기다리는 중간 단계 자체가
 *   없다(Supabase 의 Confirm email 설정에 대응하던 화면이었다).
 * - 실패 문구도 `?error=` 로 왕복하지 않는다. 인증이 브라우저에서 일어나므로
 *   각 폼이 자기 자리에서 보여준다 — 입력값이 날아가지 않는다.
 * - 이 화면은 proxy 의 공개 목록에 있어야 한다. 없으면 가입하려는 사람이
 *   로그인 화면으로 튕긴다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "회원가입" };

export default function SignupPage() {
  return (
    <AuthShell
      description="밭을 등록하면 다음 관측분부터 리포트를 받아보실 수 있습니다."
      footer={
        <p className="mt-8 text-fg-muted text-sm">
          이미 계정이 있으신가요?{" "}
          <Link
            className="text-accent underline underline-offset-4 transition-colors hover:text-accent-hover"
            href="/login"
          >
            로그인
          </Link>
        </p>
      }
      headline={
        <>
          밭 하나를 등록하면,
          <br />
          내일 아침 첫 리포트가 옵니다.
        </>
      }
      title="계정 만들기"
    >
      <SignupPanel />
    </AuthShell>
  );
}
