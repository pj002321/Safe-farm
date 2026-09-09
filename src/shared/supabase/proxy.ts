import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * ---------------------------------------------
 * [Feature]: 요청마다 Supabase 세션 갱신
 *
 * [Description]
 * - Server Component는 쿠키를 쓸 수 없다. 그래서 만료된 토큰을 갱신할 곳이
 *   proxy밖에 없다. 이게 없으면 사용자가 무작위로 로그아웃된다.
 * - ⚠️ `setAll`의 **두 번째 인자 `headers`를 반드시 응답에 얹어야 한다.**
 *   라이브러리가 `Cache-Control: private, no-store` 등을 여기로 넘기는데,
 *   빠뜨리면 인증된 응답이 CDN에 캐시되어 **다른 사용자에게 세션이 샌다.**
 *   (Vercel 공식 템플릿이 이 인자를 누락하고 있다.)
 * - `createServerClient`와 `getClaims()` 사이에 코드를 넣지 말 것.
 *   Supabase가 명시적으로 경고하는 지점이다.
 * ---------------------------------------------
 */

/** 로그인 없이 접근 가능한 경로. 여기에 없으면 /login 으로 보낸다. */
const PUBLIC_PATHS = ["/login", "/auth"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
          // 이 루프가 CDN 세션 유출을 막는다. 지우지 말 것.
          for (const [key, value] of Object.entries(headers)) {
            supabaseResponse.headers.set(key, value);
          }
        },
      },
    },
  );

  // createServerClient 와 getClaims() 사이에 아무것도 넣지 않는다.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // supabaseResponse를 그대로 반환해야 한다. 새 응답을 만들면 쿠키가 유실되어
  // 브라우저와 서버의 세션이 어긋난다.
  return supabaseResponse;
}
