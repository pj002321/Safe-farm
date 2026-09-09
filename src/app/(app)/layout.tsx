/**
 * ---------------------------------------------
 * [Feature]: 사용자 셸 레이아웃
 *
 * [Description]
 * - `(app)` 은 route group이라 URL에 나타나지 않는다. `/`, `/fields` 그대로다.
 * - 관리자 화면과 헤더·네비를 분리하려고 나눴다.
 * ---------------------------------------------
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <span className="font-bold text-accent">Safe Farm AI</span>
        </nav>
      </header>
      {children}
    </div>
  );
}
