/**
 * ---------------------------------------------
 * [Feature]: 테마 모드 계약
 *
 * [Description]
 * - 다크모드의 단일 출처. globals.css 는 `[data-theme]` 속성 하나만 본다.
 * - **기본값은 다크다**(`DEFAULT_THEME`). 저장된 값이 없으면 OS 설정을 따르지 않고
 *   다크를 칠한다. 이 서비스의 기준 디자인이 위성 관측 화면(어두운 배경)이기 때문이다.
 * - 그래서 부트스트랩은 `data-theme` 을 **항상** 세팅한다. 속성을 지워 OS 설정에
 *   맡기던 예전 방식은 라이트 OS 사용자가 기본 다크를 볼 수 없게 만든다.
 *   globals.css 의 `prefers-color-scheme` 블록은 스크립트가 실패했을 때만 작동하는
 *   안전망으로 남는다 — 지우지 말 것.
 * - 서버(ThemeScript)와 클라이언트(테마 토글)가 함께 import 하므로
 *   "use client" 를 붙이지 않는다. 브라우저 API 는 `public/theme-init.js` 안에만 둔다.
 *
 * [Usage]
 * ```ts
 * const applied = resolveTheme(mode, matchMedia("(prefers-color-scheme: dark)").matches);
 * ```
 * ---------------------------------------------
 */

/** 사용자가 고를 수 있는 값. 실제 적용 테마와 구분된다("system" 은 적용값이 아니다). */
export type ThemeMode = "light" | "dark" | "system";

/** localStorage 키. 스크립트 문자열과 토글이 같은 값을 봐야 하므로 상수로 고정한다. */
export const THEME_STORAGE_KEY = "safe-farm-theme";

/**
 * 저장된 선택이 없을 때 칠하는 테마.
 *
 * `public/theme-init.js` 가 같은 값을 하드코딩하고 있다(번들 밖이라 import 가 닿지
 * 않는다). 둘이 어긋나는지는 theme.test.ts 가 검사한다.
 */
export const DEFAULT_THEME: Extract<ThemeMode, "light" | "dark"> = "dark";

/**
 * 저장된 모드와 OS 선호를 합쳐 실제로 적용될 테마를 정한다.
 *
 * ⚠️ 지금 앱의 부트스트랩은 이 함수를 쓰지 않는다(기본값이 다크로 고정돼 "system"
 * 경로가 실행되지 않는다). 설정 화면에 3선택 컨트롤을 낼 때 쓸 자리로 남겨 둔다.
 */
export function resolveTheme(
  mode: ThemeMode,
  prefersDark: boolean,
): "light" | "dark" {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

/**
 * 부트스트랩 스크립트의 경로. 실제 코드는 `public/theme-init.js` 에 있다.
 *
 * 문자열로 들고 있다가 인라인 <script> 로 그리지 않는 이유는 ThemeScript.tsx
 * 주석에 적어 두었다 — 요약하면 React 19 가 경고를 내고, next/script 의
 * beforeInteractive 는 첫 페인트 이전 실행을 보장하지 못한다.
 */
export const THEME_INIT_SRC = "/theme-init.js";
