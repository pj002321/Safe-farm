import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicConfig } from "./config";

/**
 * ---------------------------------------------
 * [Feature]: proxy 에서의 세션 갱신
 *
 * [Description]
 * - **Server Component 는 쿠키를 쓸 수 없다.** 그래서 만료가 다가온 액세스 토큰을
 *   갱신하고 새 쿠키를 내려보낼 수 있는 곳은 `proxy.ts` 하나뿐이다. 이 파일을
 *   지우면 사용자가 무작위로 로그아웃된다.
 * - `setAll` 은 **요청과 응답 양쪽에** 쓴다. 요청에만 쓰면 이번 렌더는 새 토큰을
 *   보지만 브라우저는 옛 쿠키를 그대로 들고 있어 다음 요청에 또 갱신이 돈다.
 *   응답에만 쓰면 이번 요청의 Server Component 가 옛 토큰을 본다.
 * - **리다이렉트에도 쿠키를 실어야 한다**(`redirectKeepingCookies`).
 *   `NextResponse.redirect()` 는 새 응답이라 방금 심은 쿠키를 버린다. 그러면
 *   "로그인했는데 계속 로그인 화면으로 튕기는" 무한 루프가 된다.
 *   Firebase 세션 쿠키는 서버가 갱신하지 않아 이 코드가 필요 없었지만,
 *   Supabase 는 refresh token 을 돌리므로 다시 필요하다. **지우지 말 것.**
 * - `getUser()` 를 쓴다. `getSession()` 은 쿠키 내용을 그대로 믿으므로 인가
 *   판단의 근거가 못 된다.
 *
 * [Usage]
 * ```ts
 * const { response, user } = await updateSupabaseSession(request);
 * return redirectKeepingCookies(request, "/login", response);
 * ```
 * ---------------------------------------------
 */

export interface ProxySessionResult {
  /** 갱신된 쿠키가 실린 응답. 이걸 그대로 돌려주거나 리다이렉트에 옮긴다. */
  response: NextResponse;
  /** 로그인하지 않았으면 null. */
  user: { id: string; email: string | null; role: string | null } | null;
}

export async function updateSupabaseSession(
  request: NextRequest,
): Promise<ProxySessionResult> {
  let response = NextResponse.next({ request });
  const { url, anonKey } = publicConfig();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // ① 요청에 반영 — 이번 요청의 Server Component 가 새 토큰을 본다.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // ② 응답을 다시 만들고 거기에도 심는다 — 브라우저가 새 쿠키를 받는다.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // 이 호출이 토큰 갱신을 일으킨다. 지우면 세션이 만료된 채로 흘러간다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { response, user: null };

  // 역할은 **app_metadata** 에서 읽는다. user_metadata 는 사용자가 직접
  // 고칠 수 있어 권한 판단에 쓰면 그대로 권한 상승 경로가 된다.
  const role =
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;

  return {
    response,
    user: { id: user.id, email: user.email ?? null, role },
  };
}

/**
 * 갱신된 쿠키를 유지한 채 리다이렉트한다.
 *
 * `NextResponse.redirect()` 로 새 응답을 만들면 `carrier` 에 심긴 쿠키가 사라진다.
 * 그 상태로 로그인 화면에 보내면, 브라우저는 갱신 전 토큰을 계속 들고 있어
 * 다음 요청도 똑같이 튕긴다 — 무한 루프다.
 */
export function redirectKeepingCookies(
  request: NextRequest,
  pathname: string,
  carrier: NextResponse,
  search = "",
): NextResponse {
  const target = new URL(pathname, request.url);
  if (search) target.search = search;

  const redirect = NextResponse.redirect(target);
  for (const cookie of carrier.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
