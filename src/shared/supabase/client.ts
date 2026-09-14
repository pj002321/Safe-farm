"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicConfig } from "./config";

/**
 * ---------------------------------------------
 * [Feature]: 브라우저용 Supabase 클라이언트
 *
 * [Description]
 * - 로그인·가입처럼 **브라우저에서만 할 수 있는 일**에 쓴다. Supabase 는 Firebase 와
 *   달리 서버에서도 비밀번호를 검증할 수 있지만, 소셜 로그인 리다이렉트와 세션
 *   쿠키 동기화는 브라우저 클라이언트가 맡는 편이 흐름이 단순하다.
 * - **권한 판단에 쓰지 않는다.** 여기서 얻은 세션은 클라이언트가 들고 있는 값이라
 *   신뢰할 수 없다. 보호는 언제나 서버(`shared/auth/session.ts`)가 한다.
 * - 싱글턴으로 둔다. 컴포넌트마다 새로 만들면 각자 다른 쿠키 구독을 열어
 *   토큰 갱신이 겹치고, 로그인 직후 화면이 한 박자 늦게 바뀐다.
 * - ⚠️ `@supabase/ssr` 의 브라우저 클라이언트는 `document.cookie` 를 쓴다.
 *   즉 세션 쿠키가 **httpOnly 가 아니다.** Firebase 세션 쿠키(httpOnly)보다
 *   XSS 에 약하므로, 이 앱에서 사용자 입력을 그대로 HTML 로 넣는 코드가
 *   생기지 않게 하는 것이 그만큼 더 중요해졌다.
 *
 * [Usage]
 * ```ts
 * const supabase = getSupabaseBrowser();
 * await supabase.auth.signInWithPassword({ email, password });
 * ```
 * ---------------------------------------------
 */

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | null = null;

export function getSupabaseBrowser(): BrowserClient {
  if (cached) return cached;
  const { url, anonKey } = publicConfig();
  cached = createBrowserClient(url, anonKey);
  return cached;
}
