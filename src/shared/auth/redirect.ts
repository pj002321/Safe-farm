/**
 * ---------------------------------------------
 * [Feature]: 로그인 후 복귀 경로 검증
 *
 * [Description]
 * - `?next=` 는 **사용자가 주소창에서 마음대로 쓰는 값**이다. 그대로 믿고
 *   redirect 에 넘기면 열린 리다이렉트(open redirect)가 된다. 공격자가
 *   `/login?next=https://evil.example` 링크를 뿌리면 우리 도메인에서 출발해
 *   피싱 페이지로 사용자가 넘어간다.
 * - 그래서 **내부 경로만** 통과시킨다. 판단 기준은 셋:
 *   1. `/` 로 시작해야 한다 — 절대 URL(`https://…`)과 상대 경로를 모두 막는다.
 *   2. `//host` 는 프로토콜 상대 URL 이라 외부로 나간다. 막는다.
 *   3. `/\host` 는 브라우저가 `//host` 로 정규화한다. 역슬래시도 같이 막는다.
 * - proxy(미들웨어)와 Server Action 이 **같은 함수**를 써야 한다. 한쪽만 검증하면
 *   검증 없는 쪽이 그대로 구멍이다. 그래서 순수 함수로 shared 에 둔다
 *   (`next/server` 의존이 없어야 Edge 런타임과 액션 양쪽에서 돈다).
 *
 * [Usage]
 * ```ts
 * safeNextPath("/admin");              // "/admin"
 * safeNextPath("https://evil.test");   // "/dashboard"
 * safeNextPath(null);                  // "/dashboard"
 * ```
 * ---------------------------------------------
 */

/** 돌아갈 곳을 못 믿겠을 때 보내는 기본 목적지. 앱 홈이다. */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

/**
 * 제어문자와 공백. 브라우저는 URL 을 파싱하기 전에 이것들을 떼어내므로,
 * 남겨두면 `"/"` 뒤에 탭·개행을 끼워 넣은 값이 검사를 통과한 뒤
 * `//evil.test` 로 되살아난다. 정상 경로에는 들어올 일이 없으니 통째로 거른다.
 * (경로 안의 진짜 공백은 `%20` 으로 인코딩되어 오므로 잘못 걸리지 않는다.)
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어문자를 "거르는" 것이 이 정규식의 목적이다. 빼면 오픈 리다이렉트가 열린다.
const CONTROL_CHARS = /[\u0000-\u0020\u007f]/;

/** 신뢰할 수 없는 `next` 값을 안전한 내부 경로로 좁힌다. 통과 못 하면 앱 홈. */
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return DEFAULT_AFTER_LOGIN;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  if (CONTROL_CHARS.test(raw)) return DEFAULT_AFTER_LOGIN;
  return raw;
}

/**
 * 구글 로그인처럼 **페이지를 떠나는** 흐름에서 복귀 경로를 맡겨 두는 쿠키 이름.
 *
 * 예전에는 `redirectTo` 의 쿼리스트링(`/auth/callback?next=…`)으로 날랐다.
 * 그런데 Supabase 는 돌아온 주소를 **허용 목록과 대조**하고, 어긋나면 조용히
 * Site URL 로 떨어뜨린다. 쿼리가 붙으면 `…/auth/callback` 만 등록된 목록과
 * 어긋날 수 있어, 콜백 대신 랜딩으로 코드가 배달되고 로그인이 완성되지 않는다.
 *
 * 그래서 `redirectTo` 는 **쿼리 없는 고정 주소**로 두고, 복귀 경로는 쿠키로 나른다.
 * 허용 목록에 한 줄만 등록하면 되므로 설정이 어긋날 여지도 함께 준다.
 *
 * ⚠️ `SameSite=Lax` 여야 한다. `Strict` 면 구글에서 돌아오는 교차 사이트
 *    최상위 이동에 실리지 않아 콜백이 빈손이 된다.
 */
export const POST_LOGIN_COOKIE = "sf-post-login";
