/**
 * ---------------------------------------------
 * [Feature]: 세션 쿠키의 이름 · 수명 · 옵션 (순수 모듈)
 *
 * [Description]
 * - Firebase Auth 는 Supabase 와 달리 쿠키에 세션을 자동으로 싣지 않는다.
 *   브라우저 SDK 가 ID 토큰을 들고 있을 뿐이라, 서버가 요청을 검증하려면
 *   우리가 직접 만든 **세션 쿠키**가 있어야 한다. 그 쿠키의 규격을 여기 모은다.
 * - 이 파일은 **순수해야 한다**(`next/headers`·`firebase-admin` 의존 금지).
 *   쿠키를 굽는 곳은 Route Handler, 읽는 곳은 Server Component 와 proxy 로
 *   서로 런타임이 다르다. 규격이 세 군데로 흩어지면 한 곳만 바뀌었을 때
 *   "로그인은 되는데 새로고침하면 풀리는" 종류의 버그가 난다. 그래서
 *   상수와 옵션 계산만 여기 두고, 테스트도 여기에 붙인다.
 *
 * [Usage]
 * ```ts
 * cookieStore.set(
 *   SESSION_COOKIE,
 *   await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS }),
 *   sessionCookieOptions(process.env.NODE_ENV === "production"),
 * );
 * ```
 * ---------------------------------------------
 */

/**
 * 세션 쿠키 이름.
 *
 * `__session` 은 Firebase Hosting 이 **유일하게 캐시 계층을 통과시키는 쿠키
 * 이름**이다. 다른 이름을 쓰면 CDN 이 쿠키를 떼어 버려 배포 환경에서만
 * 로그인이 풀린다. 지금 호스팅이 Firebase 가 아니더라도 이 규약을 맞춰 두면
 * 나중에 옮길 때 고칠 것이 없다.
 */
export const SESSION_COOKIE = "__session";

/**
 * 세션 쿠키 수명(밀리초). 14일.
 *
 * ⚠️ **Firebase 의 `createSessionCookie` 가 허용하는 상한이 정확히 14일이다.**
 * 이보다 큰 값을 주면 빌드·타입 검사는 멀쩡히 통과하고 **런타임에 거절당한다**
 * (`auth/invalid-session-cookie-duration`). 하한은 5분이다.
 * 늘리고 싶다면 여기가 아니라 재로그인 흐름을 손봐야 한다.
 */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** 쿠키 `maxAge` 는 **초** 단위다. 밀리초를 그대로 넣으면 수명이 1000배가 된다. */
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

/** `cookies().set()` 에 그대로 넘기는 옵션. */
export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * 세션 쿠키 옵션을 만든다. 순수 함수.
 *
 * - `httpOnly`: JS 가 못 읽게 한다. XSS 가 한 번 터져도 세션 자체는 못 훔친다.
 * - `secure`: 운영에서만 켠다. 로컬은 `http://localhost` 라 켜면 쿠키가
 *   아예 저장되지 않아 "로그인이 안 된다"로 보인다.
 * - `sameSite: "lax"`: **"strict" 로 올리지 말 것.** strict 는 외부 링크를 타고
 *   들어온 첫 요청에 쿠키를 싣지 않는다. 이미 로그인한 사용자가 메일이나
 *   카카오톡 링크로 들어오면 로그아웃 화면을 보게 되고, 새로고침해야 정상으로
 *   돌아온다. lax 는 GET 이동에는 쿠키를 싣고 크로스 사이트 POST 는 막아서
 *   CSRF 방어와 UX 를 둘 다 챙긴다.
 * - `path: "/"`: 앱 전체가 같은 세션을 본다. 지우는 쪽도 같은 path 여야
 *   실제로 삭제된다.
 */
export function sessionCookieOptions(
  isProduction: boolean,
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * 설정·인프라 결함을 뜻하는 `auth/*` 코드.
 *
 * firebase-admin 은 **토큰 문제도 설정 문제도 똑같이 `auth/` 접두사로 던진다.**
 * (`node_modules/firebase-admin/lib/auth/error.js` 의 AuthErrorCode 확인)
 * 그래서 "`auth/` 로 시작하면 로그인 안 한 것"이라는 판정은 위험하다 —
 * 권한 오설정이 "비로그인"으로 둔갑한다.
 *
 * 특히 이 프로젝트는 `verifySessionCookie(cookie, true)` 로 checkRevoked 를
 * 켜 두었는데, 이건 순수 로컬 검증이 아니라 매 요청 `getUser()` 를 호출한다.
 * 배포 환경의 서비스 계정에 `firebaseauth.users.get` 권한이 없으면 403 이
 * `auth/insufficient-permission` 으로 매핑되고(error.js:603 PERMISSION_DENIED →
 * INSUFFICIENT_PERMISSION), 접두사만 보는 판정은 이걸 삼켜서 **전 사용자가
 * 로그에 아무 흔적도 없이 `/login` 을 무한 반복하게 만든다.**
 * 증상을 숨기는 예외처리라 AGENTS.md 가 금지하는 종류다.
 */
const SESSION_CONFIG_ERROR_CODES: ReadonlySet<string> = new Set([
  "auth/configuration-not-found",
  "auth/insufficient-permission",
  "auth/internal-error",
  "auth/invalid-credential",
  "auth/project-not-found",
  "auth/quota-exceeded",
]);

/**
 * "이 실패는 그냥 로그인 안 한 것"인가?
 *
 * `true` 면 null 로 처리해 로그인 화면으로 보내고, `false` 면 **던져서** 500 을
 * 낸다. 고장을 조용히 로그인 화면으로 바꾸지 않는 것이 요점이다.
 *
 * 삼키는 쪽: 만료·폐기·형식 오류·삭제된 사용자(`auth/session-cookie-expired`,
 * `auth/id-token-revoked`, `auth/user-not-found` 등) — 전부 사용자가 다시
 * 로그인하면 풀리는 문제다.
 *
 * 던지는 쪽: 위 SESSION_CONFIG_ERROR_CODES 와 `auth/` 가 아닌 모든 것
 * (서비스 계정 누락, 잘못된 PEM, 네트워크 단절).
 *
 * `session.ts` 와 `proxySession.ts` 가 **같은 함수를 쓴다.** 판정이 두 벌로
 * 갈라지면 화면과 proxy 가 서로 다른 판단을 해서 리다이렉트 루프가 난다.
 */
export function isInvalidSessionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code: unknown }).code;
  if (typeof code !== "string") return false;
  return code.startsWith("auth/") && !SESSION_CONFIG_ERROR_CODES.has(code);
}
