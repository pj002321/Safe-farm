/**
 * ---------------------------------------------
 * [Feature]: 테마 모드 계약
 *
 * [Description]
 * - 다크모드의 단일 출처. globals.css 는 `[data-theme]` 속성 하나만 본다.
 * - "system" 은 속성을 **지우는 것**으로 표현한다. "light"/"dark" 를 박아두면
 *   globals.css 의 prefers-color-scheme 미디어쿼리가 영영 죽어서,
 *   OS 설정을 바꿔도 화면이 따라오지 않는다.
 * - 서버(ThemeScript)와 클라이언트(테마 토글)가 함께 import 하므로
 *   "use client" 를 붙이지 않는다. 브라우저 API 는 문자열 스크립트 안에만 둔다.
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

/** 저장된 모드와 OS 선호를 합쳐 실제로 적용될 테마를 정한다. */
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
