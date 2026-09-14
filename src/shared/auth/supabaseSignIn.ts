"use client";

import { getSupabaseBrowser } from "@/shared/supabase/client";
import {
  type Consent,
  PENDING_CONSENT_COOKIE,
  serializeConsent,
} from "./consent";
import { POST_LOGIN_COOKIE, safeNextPath } from "./redirect";

/**
 * ---------------------------------------------
 * [Feature]: 브라우저에서 하는 로그인·가입·로그아웃
 *
 * [Description]
 * - 화면이 인증 SDK 를 직접 만지지 않게 감싼다. 공급자가 바뀌어도(이번처럼)
 *   폼 코드는 그대로 두고 이 파일만 갈아끼우면 된다.
 * - **오류 메시지를 우리 문구로 바꾼다.** Supabase 가 주는 영문 메시지를 그대로
 *   띄우면 농민 사용자가 읽을 수 없고, 일부는 내부 사정을 흘린다.
 * - **"이메일이 없다"와 "비밀번호가 틀렸다"를 구분하지 않는다.** 구분해서
 *   알려주면 공격자가 가입된 이메일 목록을 만들 수 있다(user enumeration).
 *   Supabase 도 같은 이유로 둘 다 `invalid_credentials` 로 준다.
 * - 구글 로그인은 **페이지를 떠난다.** Firebase 의 팝업과 달라서, 이 함수는
 *   성공을 돌려주지 않고 브라우저가 그대로 구글로 이동한다. 돌아오는 곳은
 *   `/auth/callback` 이다.
 *
 * [Usage]
 * ```ts
 * const result = await signInWithEmail(email, password);
 * if (!result.ok) setError(result.message);
 * ```
 * ---------------------------------------------
 */

export type SignInResult = { ok: true } | { ok: false; message: string };

/** Supabase 오류를 사용자가 읽을 문구로. 모르는 오류는 뭉뚱그린다. */
function toMessage(error: { message?: string; code?: string }): string {
  const code = error.code ?? "";
  const raw = error.message ?? "";

  if (code === "invalid_credentials" || raw.includes("Invalid login")) {
    // 이메일 존재 여부를 흘리지 않는다(위 주석 참고).
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (code === "email_not_confirmed") {
    return "메일함에서 인증 링크를 먼저 눌러 주세요.";
  }
  if (code === "user_already_exists" || raw.includes("already registered")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (code === "weak_password") {
    return "비밀번호가 너무 약합니다. 8자 이상으로 만들어 주세요.";
  }
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  ) {
    return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (raw.includes("fetch") || raw.includes("network")) {
    return "네트워크에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<SignInResult> {
  const { error } = await getSupabaseBrowser().auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    // 원문은 콘솔에만. 화면에는 우리 문구만 나간다.
    console.error("[auth] 로그인 실패", error);
    return { ok: false, message: toMessage(error) };
  }
  return { ok: true };
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName?: string;
  consent: Consent;
}): Promise<SignInResult> {
  const { error } = await getSupabaseBrowser().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // user_metadata 로 들어간다. **권한 판단에 쓰지 않는다** — 사용자가
      // updateUser() 로 직접 고칠 수 있다. 프로필 트리거가 표시용으로만 읽고,
      // 동의 시각은 가입 직후 서버(recordConsent)가 다시 기록한다.
      data: {
        ...(input.fullName?.trim() ? { full_name: input.fullName.trim() } : {}),
        consent: input.consent,
      },
      emailRedirectTo: callbackUrl(),
    },
  });
  if (error) {
    console.error("[auth] 가입 실패", error);
    return { ok: false, message: toMessage(error) };
  }
  return { ok: true };
}

/**
 * 구글 로그인. **성공을 돌려주지 않는다** — 브라우저가 구글로 이동한다.
 *
 * 실패(설정 누락 등)일 때만 결과가 돌아온다.
 */
/**
 * 동의를 쿠키에 맡긴다. 구글에서 돌아온 `/auth/callback`(서버)이 읽어 기록한다.
 *
 * 예전에는 sessionStorage 에 넣었는데 **읽는 쪽이 없었다** — 브라우저 안에만
 * 있는 값이라 서버 라우트인 콜백이 볼 수 없었기 때문이다. 그 결과 구글로 가입한
 * 사용자의 동의가 한 건도 기록되지 않았다.
 */
export async function signInWithGoogle(
  consent?: Consent,
  next?: string,
): Promise<SignInResult> {
  // 구글 로그인은 **페이지를 떠난다.** React 상태에 든 값은 돌아올 때 사라지므로
  // 필요한 것만 쿠키에 맡긴다. 콜백이 읽고 지운다.
  if (consent) stashCookie(PENDING_CONSENT_COOKIE, serializeConsent(consent));
  if (next) stashCookie(POST_LOGIN_COOKIE, safeNextPath(next));

  const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl() },
  });
  if (error) {
    console.error("[auth] 구글 로그인 실패", error);
    return { ok: false, message: toMessage(error) };
  }
  return { ok: true };
}

/** 로그아웃. 이 기기의 세션만 지운다. */
export async function signOutEverywhere(): Promise<void> {
  await getSupabaseBrowser().auth.signOut();
  // 서버 컴포넌트가 들고 있는 캐시를 비우려면 새로고침이 필요하다.
  // router.refresh() 로는 proxy 를 다시 타지 않아 세션이 남은 것처럼 보인다.
  window.location.assign("/");
}

/**
 * OAuth 가 돌아올 주소.
 *
 * `window.location.origin` 을 쓴다 — 로컬·프리뷰·운영에서 각각 자기 자신으로
 * 돌아와야 하기 때문이다. 환경변수에 박으면 프리뷰에서 운영으로 튄다.
 * `next` 는 사용자가 고칠 수 있으므로 `safeNextPath` 로 내부 경로임을 보증한다.
 */
function callbackUrl(): string {
  // ⚠️ **쿼리를 붙이지 않는다.** Supabase 는 돌아온 주소를 허용 목록과 대조하고,
  //    어긋나면 조용히 Site URL 로 떨어뜨린다. `?next=` 하나 때문에 인증 코드가
  //    콜백 대신 랜딩으로 배달되어 로그인이 완성되지 않는 일이 실제로 있었다.
  //    복귀 경로는 쿠키(POST_LOGIN_COOKIE)로 나른다.
  return new URL("/auth/callback", window.location.origin).toString();
}

/** 브라우저에서 짧게 사는 쿠키 하나를 심는다. 구글 왕복 동안만 필요하다. */
function stashCookie(name: string, value: string): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "Max-Age=600",
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") attributes.push("Secure");
  // biome-ignore lint/suspicious/noDocumentCookie: 대안으로 권하는 Cookie Store API 는 Chrome 계열에만 있다. Safari·Firefox 에 없어 쓰면 iOS 사용자가 구글 로그인을 통째로 못 한다.
  document.cookie = attributes.join("; ");
}
