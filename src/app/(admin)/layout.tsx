import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireConsentOrRedirect } from "@/shared/auth/consentGate";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 셸 + 실제 접근 차단
 *
 * [Description]
 * - 여기가 화면 차단의 실제 지점이다. 관리자가 아니면 `/dashboard` 로 돌려보낸다
 *   (`requireAdminOrRedirect`). proxy 도 같은 곳으로 보내므로 두 겹이 같은 말을 한다.
 * - ⚠️ 그래도 **보안 경계는 아니다.** 이 레이아웃은 Server Action에 영향을 주지
 *   않는다. 관리자 액션은 각자 `requireAdmin()` 을 첫 줄에서 불러야 한다.
 *   Next 공식: "Render-time gating is not a security boundary."
 * - 관리자도 **동의 게이트를 거친다.** 약관 동의는 역할과 무관한 법적 절차라,
 *   관리자만 예외로 두면 기록이 비는 계정이 다시 생긴다.
 * - 메뉴 줄(`AdminNav`)은 헤더 아래 한 줄이다. 목록은 `adminTabs.ts` 한 곳에서
 *   오므로 화면을 추가할 때 이 파일은 안 건드린다.
 * ---------------------------------------------
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireAdminOrRedirect();
  await requireConsentOrRedirect();

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <Link href="/admin" className="font-bold text-earth">
            Safe Farm AI · 관리자
          </Link>
          <span className="flex-1" />
          <Link href="/dashboard" className="text-fg-muted text-sm underline">
            사용자 화면으로
          </Link>
          <span className="text-fg-muted text-sm">{viewer.email}</span>
        </nav>
      </header>
      <AdminNav />
      {children}
    </div>
  );
}
