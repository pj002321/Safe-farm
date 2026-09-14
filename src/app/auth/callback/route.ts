import { type NextRequest, NextResponse } from "next/server";
import {
  deserializeConsent,
  isConsentComplete,
  PENDING_CONSENT_COOKIE,
} from "@/shared/auth/consent";
import { recordConsentForUser } from "@/shared/auth/profileStore";
import { POST_LOGIN_COOKIE, safeNextPath } from "@/shared/auth/redirect";
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
 * - 가입 화면에서 온 경우 **동의를 여기서 기록한다.** 구글 로그인은 페이지를
 *   떠나므로 React 상태의 동의가 사라지는데, 브라우저가 떠나기 직전 쿠키에
 *   맡겨 두고 여기서 받아 적는다. 이메일 가입은 이 경로를 타지 않는다 —
 *   `handle_new_user` 트리거가 `raw_user_meta_data.consent` 를 읽어 찍는다.
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

  // 복귀 경로는 **쿠키**로 온다. 쿼리로 나르면 `redirectTo` 에 쿼리가 붙는데,
  // Supabase 가 허용 목록과 대조할 때 어긋나 인증 코드를 Site URL 로 떨어뜨린다.
  // 쿼리도 함께 본다 — 예전 방식으로 시작한 왕복이 진행 중일 수 있다.
  const next = safeNextPath(
    request.cookies.get(POST_LOGIN_COOKIE)?.value ?? searchParams.get("next"),
  );

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // 원문은 로그에만. 사용자 화면에는 내부 정보를 흘리지 않는다.
    console.error("[auth/callback] 코드 교환 실패", error);
    return NextResponse.redirect(new URL("/login?error=1", origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));

  // 가입 화면에서 넘어온 동의를 받아 적는다. 로그인 경로에서 왔으면 쿠키가 없고,
  // 그때는 아무 일도 일어나지 않는다.
  const pending = deserializeConsent(
    request.cookies.get(PENDING_CONSENT_COOKIE)?.value,
  );
  if (data.user && isConsentComplete(pending)) {
    try {
      // 방금 코드 교환을 끝낸 클라이언트를 그대로 넘긴다. 새로 만들면 같은 요청
      // 안에서 방금 심은 세션 쿠키가 읽히는지에 기대게 된다.
      await recordConsentForUser(supabase, data.user.id, {
        termsAgreed: pending.terms,
        privacyAgreed: pending.privacy,
        marketingOptIn: pending.marketing,
      });
    } catch (consentError) {
      // ⚠️ 여기서 로그인을 막지 않는다. 신원 확인은 이미 끝났고, 기록이 비는 것은
      //    동의를 한 번 더 받아 메울 수 있다. 반대로 로그인을 막으면 사용자는
      //    들어오지도 못하면서 동의도 여전히 기록되지 않는다.
      //    증상을 숨기는 것이 아니라 **더 나쁜 결과를 피하는 것**이므로, 원인을
      //    추적할 수 있도록 원문을 로그에 남긴다.
      console.error("[auth/callback] 동의 기록 실패", consentError);
    }
  }

  // 성공했든 실패했든 지운다. 남겨 두면 다음 로그인에 옛 값이 따라붙는다.
  response.cookies.delete(PENDING_CONSENT_COOKIE);
  response.cookies.delete(POST_LOGIN_COOKIE);

  return response;
}
