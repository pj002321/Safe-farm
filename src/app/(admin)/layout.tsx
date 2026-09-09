import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 셸 레이아웃 + 접근 게이트
 *
 * [Description]
 * - `(admin)` route group. URL은 `/admin/...` 그대로다.
 *
 * [⚠️ 이 게이트는 보안 경계가 아니다 — UX다]
 * Next 공식 문서: "A page-level authentication check does not extend to the
 * Server Actions defined within it. Always re-verify inside the action."
 * 그리고 "Render-time gating is not a security boundary."
 *
 * 즉 이 레이아웃은 **관리자가 아닌 사람에게 화면을 안 보여줄 뿐**이고,
 * Server Action은 export되는 순간 직접 POST로 호출 가능한 공개 엔드포인트가 된다.
 * 실제 권한 검사는 **모든 관리자 Server Action 첫 줄**에서 다시 해야 한다.
 *
 * [현재 구현 수준]
 * route group은 URL 세그먼트를 만들지 않으므로 이 레이아웃의 경로 타입은 "/" 다.
 *
 * 세션 쿠키 존재 여부만 본다. InsForge 연결 후 역할(role) 조회를 추가해야
 * 진짜 "관리자만"이 된다. 지금은 로그인한 사람이면 통과한다.
 * ---------------------------------------------
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const hasSession = (await cookies()).has("insforge_access_token");
  if (!hasSession) redirect("/sign-in");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <span className="font-bold text-earth">Safe Farm AI · 관리자</span>
        </nav>
      </header>
      {children}
    </div>
  );
}
