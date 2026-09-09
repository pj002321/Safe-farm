import Link from "next/link";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 셸 + 실제 접근 차단
 *
 * [Description]
 * - 여기가 화면 차단의 실제 지점이다. 관리자가 아니면 `/` 로 돌려보낸다.
 * - ⚠️ 그래도 **보안 경계는 아니다.** 이 레이아웃은 Server Action에 영향을 주지
 *   않는다. 관리자 액션은 각자 `requireAdmin()` 을 첫 줄에서 불러야 한다.
 *   Next 공식: "Render-time gating is not a security boundary."
 * ---------------------------------------------
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireAdminOrRedirect();

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <Link href="/admin" className="font-bold text-earth">
            Safe Farm AI · 관리자
          </Link>
          <span className="flex-1" />
          <Link href="/" className="text-fg-muted text-sm underline">
            사용자 화면으로
          </Link>
          <span className="text-fg-muted text-sm">{viewer.email}</span>
        </nav>
      </header>
      {children}
    </div>
  );
}
