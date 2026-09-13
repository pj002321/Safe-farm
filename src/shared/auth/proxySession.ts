import { type NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/shared/firebase/admin";
import { safeNextPath } from "./redirect";
import { isInvalidSessionError, SESSION_COOKIE } from "./sessionCookie";

/**
 * ---------------------------------------------
 * [Feature]: 요청마다 공개/보호 경로 분기 (proxy 본체)
 *
 * [Description]
 * - Supabase 판과 **결정적으로 다른 점**: 여기서 세션을 갱신하지 않는다.
 *   Supabase 는 만료된 토큰을 미들웨어에서만 새로 발급할 수 있어서 쿠키를
 *   응답마다 다시 실어 나르는 코드(`setAll`·헤더 루프·`redirectKeepingCookies`)가
 *   필요했다. Firebase 세션 쿠키는 수명이 고정이고 서버가 연장하지 않는다 —
 *   만료되면 브라우저 SDK 가 다시 로그인해 `/api/auth/session` 으로 새 쿠키를
 *   받아 간다. 그래서 여기서는 읽고 판단만 하면 되고, 쿠키 이관 코드는 통째로
 *   사라졌다. (없앤 게 아니라 필요가 없어진 것이다. 다시 넣지 말 것.)
 * - 여기 검사는 **UX** 다. 실제 권한 판단은 `shared/auth/session.ts` 의
 *   `getViewer()`(checkRevoked 켬)가 Server Component·Server Action 에서 다시 한다.
 *   proxy 는 모든 요청을 타므로 매번 Auth 서버까지 왕복시키지 않는다.
 * - Next 16 의 proxy 는 기본이 **Node.js 런타임**이라 firebase-admin 을 그대로
 *   쓸 수 있다. Edge 우회 꼼수가 필요 없다.
 * ---------------------------------------------
 */

/**
 * 로그인 없이 접근 가능한 경로.
 *
 * **접두사 매칭 하나로 처리하면 두 군데가 뚫린다.** 그래서 목록을 둘로 나눈다.
 *   1. `"/"` 를 접두사 목록에 넣는 순간 **모든 경로가 공개된다** —
 *      세상의 모든 경로는 `"/"` 로 시작하기 때문이다. 랜딩(`/`)은 공개해야
 *      하지만 `/admin` 은 아니므로, 루트는 **정확히 일치**로만 연다.
 *   2. `startsWith("/login")` 은 `"/loginhack"` 처럼 이름만 겹치는 남의 경로도
 *      통과시킨다. 하위 트리를 열 때는 경로 경계(`/`)까지 확인한다.
 */
/**
 * 정확히 일치할 때만 공개. 랜딩(`/`)과 리포트 데모(`/report`) 둘뿐이다.
 *
 * `/report` 는 가입 전 사용자에게 서비스가 무엇을 내놓는지 보여주는 화면이라
 * 로그인 뒤로 숨기면 존재 이유가 사라진다. 고정 데모 데이터만 쓰고 사용자
 * 데이터를 읽지 않으므로 공개해도 새는 것이 없다.
 */
const PUBLIC_EXACT = new Set(["/", "/report"]);

/**
 * 이 경로 자신과 그 하위 트리가 공개. 경계는 `/` 로 끊어서 본다.
 *
 * Supabase 판의 `/auth`(OAuth·메일 인증 콜백)는 사라졌다 — Firebase 는 팝업으로
 * 로그인해 콜백 경로가 필요 없다. 대신 **`/api/auth` 를 공개로 둔다.**
 * 세션 쿠키를 만드는 요청은 그 정의상 **아직 세션이 없는 상태로 들어온다.**
 * 여기 없으면 로그인 직후 `/api/auth/session` POST 가 `/login` 으로 307 되어
 * 영원히 로그인하지 못한다(로그아웃 DELETE 도 같은 이유로 함께 열린다).
 */
const PUBLIC_PREFIXES = ["/login", "/signup", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** 관리자 전용 경로. 이 접두사 아래는 role=admin 만 통과한다. */
const ADMIN_PREFIX = "/admin";

/**
 * 세션 쿠키를 검증해 **역할까지** 돌려준다. 실패는 전부 "로그인 안 함"(null).
 *
 * boolean 이 아니라 역할을 돌려주는 이유: 관리자 경로를 여기서 함께 거르기
 * 위해서다. 어차피 토큰을 디코딩하므로 추가 비용이 없는데, boolean 만 쓰면
 * 비관리자가 `/admin` 을 열었을 때 관리자 레이아웃까지 렌더가 돌아간 뒤에야
 * 리다이렉트된다.
 *
 * 설정 오류(서비스 계정 누락)까지 null 로 뭉개면 전 사용자가 `/login` 으로
 * 튕기면서 원인은 어디에도 안 보인다. 그래서 설정 오류는 던져서 500 을 내고,
 * 토큰 문제(`auth/…`)만 null 로 처리한다 — `session.ts` 와 같은 기준이다.
 */
async function readSessionRole(
  request: NextRequest,
): Promise<"admin" | "user" | null> {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie);
    return decoded.role === "admin" ? "admin" : "user";
  } catch (error) {
    // 판정은 sessionCookie.ts 한 곳에만 둔다. 여기와 session.ts 가 서로 다르게
    // 판단하면 proxy 는 통과시키고 화면은 튕겨서 리다이렉트 루프가 난다.
    if (isInvalidSessionError(error)) return null;
    throw error;
  }
}

export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 공개 경로 중 로그인·가입 화면만 세션 여부에 따라 분기가 필요하다.
  // 나머지 공개 경로는 확인 자체를 건너뛰어 왕복을 아낀다.
  const isAuthForm = pathname === "/login" || pathname === "/signup";
  if (isPublicPath(pathname) && !isAuthForm) {
    return NextResponse.next();
  }

  const role = await readSessionRole(request);
  const signedIn = role !== null;

  if (!signedIn && !isAuthForm) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // 로그인 후 원래 가려던 곳으로 돌려보낸다. 이 값은 사용자가 주소창에서
    // 고칠 수 있으므로 safeNextPath 로 내부 경로임을 보증한 뒤에 붙인다.
    url.searchParams.set("next", safeNextPath(`${pathname}${search}`));
    return NextResponse.redirect(url);
  }

  // 이미 로그인한 사용자에게 로그인·가입 폼을 다시 보여줄 이유가 없다.
  if (signedIn && isAuthForm) {
    const target = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(target, request.nextUrl.origin));
  }

  // 관리자가 아닌 사람이 관리자 경로에 들어오면 앱 홈으로 되돌린다.
  // ⚠️ 이건 **UX 게이트일 뿐 보안 경계가 아니다.** matcher 가 바뀌거나 경로가
  // 옮겨지면 이 검사는 조용히 빠진다. 실제 차단은 (admin)/layout.tsx 의
  // requireAdminOrRedirect 와, 데이터를 만지는 액션의 requireAdmin() 이 한다.
  if (
    role === "user" &&
    (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`))
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  return NextResponse.next();
}
