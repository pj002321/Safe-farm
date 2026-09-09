import Link from "next/link";
import { getViewer } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 사용자 셸 + 역할별 네비 분기
 *
 * [Description]
 * - 관리자에게만 `/admin` 링크를 보여준다. **이건 UX일 뿐 보안이 아니다** —
 *   링크를 숨겨도 URL을 직접 치면 들어온다. 실제 차단은 (admin)/layout.tsx 가 한다.
 * ---------------------------------------------
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <Link href="/" className="font-bold text-accent">
            Safe Farm AI
          </Link>
          <span className="flex-1" />
          {viewer?.isAdmin && (
            <Link href="/admin" className="text-earth text-sm underline">
              관리자
            </Link>
          )}
          <span className="text-fg-muted text-sm">
            {viewer ? viewer.email : "비로그인"}
          </span>
        </nav>
      </header>
      {children}
    </div>
  );
}
