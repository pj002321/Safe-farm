import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/shared/auth/redirect";
import { getSupabaseServer } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: OAuth 콜백 (구글 로그인)
 *
 * [Description]
 * - Supabase 의 소셜 로그인은 **페이지를 떠난다.** 구글에서 돌아올 때 이 경로로
 *   `?code=...` 가 붙어 오고, 그 코드를 세션으로 바꾸는 것이 여기 일이다.
 *   (Firebase 판은 `signInWithPopup` 이라 콜백 경로가 아예 없었다.)
 * - **이 경로는 공개여야 한다.** 요청이 도착하는 시점에는 아직 세션이 없다.
 *   `proxySession.ts` 의 `PUBLIC_PREFIXES` 에 `/auth` 가 있는 이유다 —
 *   빠지면 콜백이 `/login` 으로 튕겨 영원히 로그인하지 못한다.
 * - 돌아갈 곳(`next`)은 **사용자가 주소창에서 고칠 수 있다.** 그대로 쓰면
 *   `?next=https://evil.example` 로 우리 도메인을 발판 삼은 피싱이 된다.
 *   `safeNextPath` 로 내부 경로임을 보증한 뒤에만 쓴다.
 * - 실패해도 **오류 원문을 사용자에게 보여주지 않는다.** 공급자 오류 메시지에는
 *   내부 설정이 섞여 나온다. `/login?error=1` 로만 알리고 자세한 건 서버 로그에 남긴다.
 *
 * [Usage]
 * ```
 * Supabase Dashboard > Authentication > URL Configuration > Redirect URLs 에
 *   https://<도메인>/auth/callback
 * ```
 * ---------------------------------------------
 */

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // 공급자가 거절한 경우(사용자가 취소 등) code 없이 error 만 온다.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    console.error("[auth/callback] 공급자 오류", providerError);
    return NextResponse.redirect(new URL("/login?error=1", origin));
  }

  if (!code) {
    console.error("[auth/callback] code 파라미터가 없습니다");
    return NextResponse.redirect(new URL("/login?error=1", origin));
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // 원문은 로그에만. 사용자 화면에는 내부 정보를 흘리지 않는다.
    console.error("[auth/callback] 코드 교환 실패", error);
    return NextResponse.redirect(new URL("/login?error=1", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
