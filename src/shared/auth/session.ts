import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth } from "@/shared/firebase/admin";
import { isInvalidSessionError, SESSION_COOKIE } from "./sessionCookie";

/**
 * ---------------------------------------------
 * [Feature]: 서버 측 세션 · 역할 확인 (Firebase 세션 쿠키)
 *
 * [Description]
 * - 브라우저 SDK 가 들고 있는 ID 토큰은 서버가 볼 수 없다. 그래서 로그인 직후
 *   `/api/auth/session` 이 구워 준 **httpOnly 세션 쿠키**를 여기서 검증한다.
 *   서버가 신뢰하는 것은 이 쿠키 하나뿐이다.
 * - 역할은 디코딩된 토큰의 **custom claim `role`** 에서 읽는다.
 *   Supabase 의 `app_metadata` 와 같은 취지다 — **클라이언트가 고칠 수 없는
 *   곳에서만 권한을 읽는다.** custom claims 는 Admin SDK(서버)로만 설정되고
 *   토큰 서명 안에 들어가므로 위조할 수 없다. Firestore 의 프로필 문서처럼
 *   사용자가 쓸 수 있는 저장소를 권한 판단에 쓰면 누구나 관리자가 된다.
 * - `verifySessionCookie(cookie, true)` 의 **두 번째 인자(checkRevoked)를 끄지 말 것.**
 *   끄면 관리자가 계정을 정지시키거나 로그아웃시켜도 쿠키가 만료될 때까지
 *   최대 14일간 계속 통과한다.
 * - ⚠️ **"검증 실패"와 "설정 오류"를 구분한다.** 만료·폐기·위조는 로그인하지
 *   않은 것과 같으므로 `null`. 하지만 서비스 계정 미설정 같은 설정 오류는
 *   **그대로 던진다.** 둘을 뭉뚱그리면 환경변수 하나가 빠졌을 때 전 사용자가
 *   조용히 로그아웃된 것처럼 보이고, 원인이 화면 어디에도 드러나지 않는다.
 * - 페이지/레이아웃의 검사는 **UX** 다. Server Action 은 export 되는 순간 직접
 *   POST 가 가능하므로, 액션 첫 줄에서 `requireUser()` / `requireAdmin()` 을 다시 부른다.
 *
 * [Usage]
 * ```ts
 * const viewer = await getViewer();     // 화면 분기 (비로그인 null)
 * const user = await requireAdmin();    // Server Action 게이트
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
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  // getAdminAuth() 는 설정이 없으면 여기서 던진다. 의도된 동작이다.
  const auth = getAdminAuth();

  try {
    const decoded = await auth.verifySessionCookie(cookie, true);
    const role: Role = decoded.role === "admin" ? "admin" : "user";

    return {
      id: decoded.uid,
      email: decoded.email ?? null,
      role,
      isAdmin: role === "admin",
    };
  } catch (error) {
    if (isInvalidSessionError(error)) return null;
    throw error;
  }
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
  if (!viewer.isAdmin) redirect("/dashboard");
  return viewer;
}
