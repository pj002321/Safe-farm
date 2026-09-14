import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: 서버에서 "지금 누가 보고 있나"를 판정
 *
 * [Description]
 * - Server Component·Server Action·Route Handler 가 권한을 판단하는 **유일한**
 *   입구다. 클라이언트가 보낸 값은 무엇도 믿지 않는다.
 * - **`getUser()` 를 쓴다. `getSession()` 을 쓰지 말 것.** `getSession()` 은
 *   쿠키에 든 JWT 를 그대로 디코드해 돌려주므로, 쿠키를 조작하면 아무 사용자나
 *   될 수 있다. `getUser()` 는 Auth 서버에 물어 토큰을 실제로 검증한다.
 *   이 파일이 인가의 근거이므로 여기서는 비용을 내고 정확성을 산다.
 * - 역할은 **`app_metadata.role`** 에서 읽는다. `user_metadata` 는 사용자가
 *   `updateUser()` 로 직접 고칠 수 있어 권한 판단에 쓰면 곧바로 권한 상승
 *   경로가 된다. `app_metadata` 는 service_role 로만 바뀐다.
 * - `profiles.role` 컬럼도 있지만 그건 **표시용 사본**이다. 권한 판단은 언제나
 *   토큰의 `app_metadata` 로 한다(스키마 주석 참고).
 *
 * [Usage]
 * ```ts
 * const viewer = await getViewer();          // 없으면 null
 * const admin = await requireAdmin();        // 아니면 throw
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
  const supabase = await getSupabaseServer();

  // getUser() 는 토큰이 없거나 만료면 error 를 담아 돌려준다(던지지 않는다).
  // 네트워크·설정 오류도 여기로 오므로 구분하지 않고 "로그인 안 함"으로
  // 뭉개면 설정 사고가 조용히 숨는다 — 아래에서 나눈다.
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (isMissingSessionError(error)) return null;
    // 설정·네트워크 문제는 던진다. 500 이 뜨는 편이 전 사용자가 원인 모를
    // /login 루프를 도는 것보다 낫다.
    throw error;
  }

  const user = data.user;
  if (!user) return null;

  const role: Role = user.app_metadata?.role === "admin" ? "admin" : "user";

  return {
    id: user.id,
    email: user.email ?? null,
    role,
    isAdmin: role === "admin",
  };
}

/**
 * "이 실패는 그냥 로그인 안 한 것"인가?
 *
 * supabase-js 는 세션 없음도, 토큰 만료도, 설정 오류도 모두 `AuthError` 로
 * 준다. 앞의 둘은 사용자가 다시 로그인하면 풀리지만 뒤쪽은 우리가 고쳐야 한다.
 * 전부 null 로 뭉개면 **권한 설정이 틀려도 "비로그인"으로 보여** 아무도 눈치
 * 못 챈다 — Firebase 판에서 실제로 밟았던 함정이라 여기서도 나눈다.
 */
function isMissingSessionError(error: { message?: string; status?: number }) {
  const message = error.message ?? "";
  return (
    message.includes("Auth session missing") ||
    message.includes("session_not_found") ||
    message.includes("JWT expired") ||
    error.status === 401
  );
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

/** 페이지·레이아웃 전용. 던지는 대신 보낸다. */
export async function requireAdminOrRedirect(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) redirect("/dashboard");
  return viewer;
}
