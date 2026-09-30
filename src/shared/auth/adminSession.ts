import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  passwordMatches,
  signAdminToken,
  verifyAdminToken,
} from "./adminToken";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 세션 (ADMIN_PASSWORD 하나로 들어온다)
 *
 * [Description]
 * - 관리자는 Supabase 계정과 **무관하다.** `/admin/login` 에서 `ADMIN_PASSWORD` 를
 *   맞히면 서명된 httpOnly 쿠키(`admin_session`)를 받는다. 사용자 로그인 여부는 보지 않는다.
 * - 페이지·레이아웃은 `requireAdminOrRedirect()`, Server Action·Route Handler 는
 *   `requireAdmin()` 을 첫 줄에서 부른다. 레이아웃 검사는 액션에 미치지 않는다.
 * - ⚠️ 공용 비밀번호라 **누가** 들어왔는지는 남지 않는다. 사람별 기록이 필요해지면
 *   Supabase 계정 + `app_metadata.role` 방식으로 돌아가야 한다.
 * ---------------------------------------------
 */

const COOKIE = "admin_session";
const SESSION_MS = 8 * 60 * 60 * 1000;

// ponytail: 프로세스 전역 잠금이다. 인스턴스가 여럿이면 인스턴스마다 따로 센다.
// 공격자가 일부러 틀려 관리자를 잠글 수는 있다(잠금 창 동안만). IP 별 한도는
// X-Forwarded-For 를 믿을 수 있는지 확인한 뒤에 붙인다.
const MAX_FAILURES = 10;
const LOCK_WINDOW_MS = 10 * 60 * 1000;
let failures: number[] = [];

function adminPassword(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

export async function hasAdminSession(): Promise<boolean> {
  const secret = adminPassword();
  if (!secret) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  return verifyAdminToken(secret, token, Date.now());
}

export type AdminLoginResult = "ok" | "wrong" | "locked" | "unconfigured";

export async function startAdminSession(
  input: string,
): Promise<AdminLoginResult> {
  const secret = adminPassword();
  if (!secret) return "unconfigured";

  const now = Date.now();
  failures = failures.filter((at) => now - at < LOCK_WINDOW_MS);
  if (failures.length >= MAX_FAILURES) return "locked";

  if (!passwordMatches(secret, input)) {
    failures.push(now);
    return "wrong";
  }

  (await cookies()).set(COOKIE, signAdminToken(secret, now + SESSION_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  return "ok";
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Server Action·Route Handler 전용. 관리자 세션이 없으면 던진다. */
export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) throw new Error("FORBIDDEN");
}

/** 페이지·레이아웃 전용. 던지는 대신 관리자 로그인으로 보낸다. */
export async function requireAdminOrRedirect(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/admin/login");
}
