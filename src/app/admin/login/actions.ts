"use server";

import { redirect } from "next/navigation";
import { endAdminSession, startAdminSession } from "@/shared/auth/adminSession";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 로그인·로그아웃 Server Actions
 *
 * [Description]
 * - ⚠️ export 하나가 곧 공개 POST 엔드포인트다. 여기 두 액션은 **로그인 전에**
 *   불려야 하므로 `requireAdmin()` 을 부르지 않는 예외다. 로그인은 비밀번호 검증
 *   자체가 검사이고, 로그아웃은 자기 쿠키를 지울 뿐이라 권한이 필요 없다.
 * - 결과는 쿼리(`?error=`)로 돌려준다. JS 없이도 폼이 동작한다.
 * ---------------------------------------------
 */

export async function loginAdmin(formData: FormData) {
  const password = formData.get("password");
  const result = await startAdminSession(
    typeof password === "string" ? password : "",
  );
  redirect(result === "ok" ? "/admin" : `/admin/login?error=${result}`);
}

export async function logoutAdmin() {
  await endAdminSession();
  redirect("/admin/login");
}
