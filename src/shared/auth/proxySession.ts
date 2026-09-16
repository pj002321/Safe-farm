import { type NextRequest, NextResponse } from "next/server";
import {
  redirectKeepingCookies,
  updateSupabaseSession,
} from "@/shared/supabase/proxy";
import { safeNextPath } from "./redirect";

/**
 * ---------------------------------------------
 * [Feature]: proxy 의 세션 갱신과 경로 분기
 *
 * [Description]
 * - **두 가지 일을 한다.** ① Supabase 액세스 토큰 갱신 ② 경로별 접근 분기.
 *   ①이 이 파일의 존재 이유다 — Server Component 는 쿠키를 쓸 수 없어서
 *   토큰을 새로 받아 내려보낼 수 있는 곳이 여기뿐이다. 지우면 사용자가
 *   무작위로 로그아웃된다.
 * - **공개 경로에서도 갱신은 한다.** Firebase 판은 공개 경로에서 조기 return
 *   했는데(세션 쿠키를 서버가 갱신하지 않아 그래도 됐다), Supabase 는 refresh
 *   token 을 돌리므로 랜딩만 보다가 토큰이 만료되면 그 다음 `/dashboard` 에서
 *   튕긴다. 그래서 갱신을 먼저 하고 분기는 그 뒤에 한다.
 * - **모든 리다이렉트가 `redirectKeepingCookies` 를 탄다.**
 *   `NextResponse.redirect()` 는 새 응답이라 방금 심은 갱신 쿠키를 버린다.
 *   그대로 두면 브라우저가 옛 토큰을 계속 들고 있어 무한 루프가 난다.
 * - 역할 검사는 **UX 게이트일 뿐 보안 경계가 아니다.** matcher 가 바뀌거나 경로가
 *   옮겨지면 조용히 빠진다. 실제 차단은 `(admin)/layout.tsx` 의
 *   `requireAdminOrRedirect` 와, 데이터를 만지는 액션의 `requireAdmin()` 이 한다.
 *
 * [Usage]
 * ```ts
 * export async function proxy(request: NextRequest) {
 *   return updateSession(request);
 * }
 * ```
 * ---------------------------------------------
 */

/**
 * 정확히 일치할 때만 공개. 랜딩·리포트 데모와 법적 고지 두 문서다.
 *
 * 약관·개인정보처리방침은 **가입 전에** 읽고 판단하는 문서라 로그인 뒤로
 * 숨기면 존재 이유가 사라진다.
 *
 * **접두사 매칭 하나로 처리하면 두 군데가 뚫린다.** `"/"` 를 접두사 목록에 넣는
 * 순간 세상의 모든 경로가 공개된다. 그래서 루트는 정확 일치로만 연다.
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/report",
  "/terms",
  "/privacy",
  "/location",
]);

/**
 * 이 경로 자신과 그 하위 트리가 공개. 경계는 `/` 로 끊어서 본다
 * (`startsWith("/login")` 만 쓰면 `/loginhack` 도 열린다).
 *
 * **`/auth` 가 돌아왔다.** Supabase 의 Google 로그인은 OAuth 리다이렉트를 타므로
 * 콜백 경로(`/auth/callback`)가 필요하고, 그 요청은 **정의상 아직 세션이 없는
 * 상태로 들어온다.** 여기 없으면 콜백이 `/login` 으로 307 되어 영원히 로그인하지
 * 못한다.
 */
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** 관리자 전용 경로. 이 접두사 아래는 role=admin 만 통과한다. */
const ADMIN_PREFIX = "/admin";

export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ⓪ 랜딩에 잘못 배달된 인증 코드를 콜백으로 넘긴다.
  //
  //    Supabase 는 돌아온 주소를 **허용 목록과 대조**하고, 어긋나면 조용히
  //    Site URL(= 우리 랜딩)로 떨어뜨린다. 오류를 내지 않으므로 화면에는
  //    "로그인을 눌렀는데 그냥 첫 화면으로 돌아왔다"로만 보인다. 실제로 이
  //    증상을 겪었고, 원인은 콘솔의 Redirect URLs 설정이었다.
  //
  //    설정을 고치는 것이 근본 해결이고 아래는 그것을 대신하지 않는다.
  //    다만 Site URL 폴백은 Supabase 의 **문서화된 동작**이라, 그 자리에서
  //    코드를 받아 넘겨 주는 편이 로그인이 조용히 실패하는 것보다 낫다.
  //    넘기는 파라미터는 우리가 아는 것만이고 목적지는 우리 경로로 고정이라
  //    열린 리다이렉트가 되지 않는다.
  const strayCode = pathname === "/" ? forwardableAuthParams(request) : null;
  if (strayCode) {
    return NextResponse.redirect(
      new URL(`/auth/callback?${strayCode}`, request.url),
    );
  }

  // ① 토큰 갱신을 **먼저** 한다. 공개 경로에서도 한다(위 주석 참고).
  //    response 에는 갱신된 쿠키가 실려 있으므로, 아래 어떤 갈래로 가든
  //    이 응답을 그대로 돌려주거나 redirectKeepingCookies 로 옮겨야 한다.
  const { response, user } = await updateSupabaseSession(request);

  const signedIn = user !== null;
  const isAuthForm = pathname === "/login" || pathname === "/signup";

  // ② 로그인한 사용자에게 로그인·가입 폼을 다시 보여줄 이유가 없다.
  if (signedIn && isAuthForm) {
    const target = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectKeepingCookies(request, target, response);
  }

  // ③ 공개 경로는 여기서 끝. 갱신된 쿠키를 실은 응답을 그대로 돌려준다.
  if (isPublicPath(pathname)) return response;

  // ④ 비로그인 사용자를 로그인으로. 원래 가려던 곳을 들려 보낸다.
  //    `next` 는 사용자가 주소창에서 고칠 수 있으므로 safeNextPath 로
  //    내부 경로임을 보증한 뒤에 붙인다(오픈 리다이렉트 방어).
  if (!signedIn) {
    const next = encodeURIComponent(safeNextPath(`${pathname}${search}`));
    return redirectKeepingCookies(request, "/login", response, `?next=${next}`);
  }

  // ⑤ 관리자가 아닌 사람이 관리자 경로에 들어오면 앱 홈으로.
  if (
    user.role !== "admin" &&
    (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`))
  ) {
    return redirectKeepingCookies(request, "/dashboard", response);
  }

  return response;
}

/**
 * 랜딩에 도착한 OAuth 파라미터를 콜백으로 넘길 쿼리 문자열로 만든다.
 *
 * **우리가 아는 이름만** 옮긴다. 들어온 쿼리를 통째로 전달하면 사용자가 만든
 * 값이 콜백으로 흘러 들어간다. 넘길 것이 없으면 null 이고, 그때는 랜딩이
 * 평소대로 그려진다(정적 프리렌더를 잃지 않도록 페이지가 아니라 여기서 본다).
 */
function forwardableAuthParams(request: NextRequest): string | null {
  const source = request.nextUrl.searchParams;
  const code = source.get("code");
  const error = source.get("error");
  if (!code && !error) return null;

  const forwarded = new URLSearchParams();
  if (code) forwarded.set("code", code);
  if (error) forwarded.set("error", error);
  const description = source.get("error_description");
  if (description) forwarded.set("error_description", description);
  return forwarded.toString();
}
