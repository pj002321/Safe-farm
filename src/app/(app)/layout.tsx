import Link from "next/link";
import { LogoWordmark } from "@/components/icons";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { getViewer } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 사용자 셸 + 역할별 네비 분기
 *
 * [Description]
 * - 관리자에게만 `/admin` 링크를 보여준다. **이건 UX일 뿐 보안이 아니다** —
 *   링크를 숨겨도 URL을 직접 치면 들어온다. 실제 차단은 (admin)/layout.tsx 가 한다.
 * - 로고는 `/dashboard` 로 간다. `/` 는 공개 랜딩이라, 로그인한 사용자가 로고를
 *   누를 때마다 마케팅 페이지로 튕겨 나가면 안 된다.
 * - 헤더를 sticky 로 둔 건 관제 화면의 기본기다. 긴 관측 목록을 스크롤하는 동안
 *   현재 계정과 테마 조작이 화면에서 사라지면 안 된다. 반투명 + backdrop-blur 로
 *   아래 내용이 비쳐 보이게 해서 층이 하나 더 얹혔다는 걸 알린다.
 * ---------------------------------------------
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-border border-b bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-fg transition-colors hover:text-accent"
          >
            <LogoWordmark />
          </Link>

          <span className="flex-1" />

          {viewer?.isAdmin && (
            <Link
              href="/admin"
              className="text-earth text-sm transition-colors hover:text-fg"
            >
              관리자
            </Link>
          )}

          {/* 계정은 보조 정보다. 좁은 화면에서는 접어서 로고·테마에 자리를 내준다. */}
          <span className="hidden text-fg-muted text-sm sm:inline">
            {viewer ? viewer.email : "비로그인"}
          </span>

          <ThemeToggle />
        </nav>
      </header>
      {children}
    </div>
  );
}
