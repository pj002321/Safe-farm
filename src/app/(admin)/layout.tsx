import Link from "next/link";
import { logoutAdmin } from "@/app/admin/login/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 셸 + 실제 접근 차단
 *
 * [Description]
 * - 여기가 화면 차단의 실제 지점이다. 관리자 세션이 없으면 `/admin/login` 으로
 *   보낸다(`requireAdminOrRedirect`). 관리자는 Supabase 계정과 무관하다
 *   (`shared/auth/adminSession.ts`).
 * - ⚠️ 그래도 **보안 경계는 아니다.** 이 레이아웃은 Server Action에 영향을 주지
 *   않는다. 관리자 액션은 각자 `requireAdmin()` 을 첫 줄에서 불러야 한다.
 *   Next 공식: "Render-time gating is not a security boundary."
 * - 메뉴 줄(`AdminNav`)은 헤더 아래 한 줄이다. 목록은 `adminTabs.ts` 한 곳에서
 *   오므로 화면을 추가할 때 이 파일은 안 건드린다.
 * ---------------------------------------------
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  await requireAdminOrRedirect();

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <Link href="/admin" className="font-bold text-earth">
            Safe Farm AI · 관리자
          </Link>
          <span className="flex-1" />
          <form action={logoutAdmin}>
            <button
              className="text-fg-muted text-sm underline hover:text-accent"
              type="submit"
            >
              로그아웃
            </button>
          </form>
        </nav>
      </header>
      <AdminNav />
      {children}
    </div>
  );
}
