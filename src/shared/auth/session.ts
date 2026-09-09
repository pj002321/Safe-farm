import { redirect } from "next/navigation";
import { createClient } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: 서버 측 세션 · 역할 확인
 *
 * [Description]
 * - 역할은 JWT의 `app_metadata.role` 에서 읽는다. **`user_metadata` 는 쓰지 말 것** —
 *   사용자가 직접 수정할 수 있어서 권한 판단에 쓰면 누구나 관리자가 된다.
 *   `app_metadata` 는 service_role 로만 변경 가능하다.
 * - `getClaims()` 는 JWT를 로컬 검증하므로 Auth 서버 왕복이 없다. 매 요청 호출해도
 *   싸다. (`getSession()` 은 쿠키를 그대로 믿으므로 서버에서 권한 판단에 쓰지 않는다.)
 * - 페이지/레이아웃의 검사는 **UX**다. Server Action은 export되는 순간 직접 POST가
 *   가능하므로, 액션 첫 줄에서 `requireUser()` / `requireAdmin()` 을 다시 부른다.
 *
 * [Usage]
 * ```ts
 * const { isAdmin } = await getViewer();        // 화면 분기
 * const user = await requireAdmin();            // Server Action 게이트
 * ```
 * ---------------------------------------------
 */

export type Role = "admin" | "user";

export interface Viewer {
  id: string;
  email: string | null;
  role: Role;
  isAdmin: boolean;
}

/** 로그인하지 않았으면 null. 화면 분기용. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const appMetadata = claims.app_metadata as { role?: string } | undefined;
  const role: Role = appMetadata?.role === "admin" ? "admin" : "user";

  return {
    id: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    role,
    isAdmin: role === "admin",
  };
}

/** Server Action 전용. 로그인하지 않았으면 던진다. */
export async function requireUser(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("UNAUTHENTICATED");
  return viewer;
}

/** Server Action 전용. 관리자가 아니면 던진다. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireUser();
  if (!viewer.isAdmin) throw new Error("FORBIDDEN");
  return viewer;
}

/** 페이지·레이아웃 전용. 관리자가 아니면 홈으로 돌려보낸다. */
export async function requireAdminOrRedirect(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) redirect("/");
  return viewer;
}
