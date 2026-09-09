import { redirect } from "next/navigation";
import { getServerInsforge } from "@/shared/insforge/server";

/**
 * ---------------------------------------------
 * [Feature]: 서버 측 세션 확인
 *
 * [Description]
 * - **모든 Server Action의 첫 줄**이 여기를 거쳐야 한다.
 *   페이지나 레이아웃의 권한 검사는 액션까지 이어지지 않는다.
 *   Next 공식 문서: "A page-level authentication check does not extend to the
 *   Server Actions defined within it. Always re-verify inside the action."
 * - `getUser`는 없으면 null, `requireUser`는 없으면 던진다.
 *   액션에서는 `requireUser`, 화면 분기에서는 `getUser`를 쓴다.
 *
 * [Usage]
 * ```ts
 * "use server";
 * export async function createField(fd: FormData) {
 *   const user = await requireUser();
 *   ...
 * }
 * ```
 * ---------------------------------------------
 */

export async function getUser() {
  const { data } = await getServerInsforge().auth.getCurrentUser();
  return data?.user ?? null;
}

/** 로그인하지 않았으면 던진다. Server Action 전용. */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** 로그인하지 않았으면 로그인 화면으로 보낸다. 페이지/레이아웃 전용. */
export async function requireUserOrRedirect() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
