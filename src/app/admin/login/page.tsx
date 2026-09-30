import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Field } from "@/components/shared/Field";
import { SubmitButton } from "@/components/shared/SubmitButton";
import { hasAdminSession } from "@/shared/auth/adminSession";
import { loginAdmin } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 로그인  →  /admin/login
 *
 * [Description]
 * - `ADMIN_PASSWORD` 하나만 받는다. 사용자 계정 로그인과 무관하다.
 * - `(admin)` 그룹 밖에 둔다. 안에 두면 그 레이아웃의 관리자 검사가 이 화면에도
 *   걸려 로그인 화면으로 가는 리다이렉트가 무한히 돈다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "관리자 로그인" };

const ERROR_KO: Record<string, string> = {
  wrong: "비밀번호가 맞지 않습니다.",
  locked: "시도가 너무 많습니다. 10분 뒤에 다시 시도하세요.",
  unconfigured: "서버에 ADMIN_PASSWORD 가 설정되지 않았습니다.",
};

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  if (await hasAdminSession()) redirect("/admin");

  const { error } = await searchParams;
  const errorKo = typeof error === "string" ? ERROR_KO[error] : undefined;

  return (
    <AuthShell
      description="관리자 비밀번호를 입력하세요."
      headline="Safe Farm 관리자"
      title="관리자 로그인"
    >
      <form action={loginAdmin} className="flex flex-col gap-4">
        <Field
          autoComplete="current-password"
          autoFocus
          error={errorKo}
          label="비밀번호"
          name="password"
          required
          type="password"
        />
        <SubmitButton pendingKo="확인 중…">로그인</SubmitButton>
      </form>
    </AuthShell>
  );
}
