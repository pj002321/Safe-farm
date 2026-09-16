/**
 * ---------------------------------------------
 * [Feature]: 테마 모드 계약
 *
 * [Description]
 * - 다크모드의 단일 출처. globals.css 는 `[data-theme]` 속성 하나만 본다.
 * - **기본값은 "system" 이다**(`DEFAULT_THEME`). 저장된 선택이 없으면 OS 설정을
 *   그대로 따른다. 예전에는 다크로 고정했는데, 라이트 OS 사용자가 들어올 때마다
 *   어두운 화면을 받고 매번 토글해야 했다. 기기 설정을 존중하는 편이 맞다.
 * - 그래도 부트스트랩은 `data-theme` 을 **항상** 세팅한다. 속성을 지우고 CSS 의
 *   `prefers-color-scheme` 에 맡기면 토글이 현재 테마를 읽을 곳이 없어진다.
 *   부트스트랩이 OS 선호를 읽어 값으로 박아 두는 편이 한 곳에서 끝난다.
 *   globals.css 의 `prefers-color-scheme` 블록은 스크립트가 실패했을 때만 작동하는
 *   안전망으로 남는다 — 지우지 말 것.
 * - 저장된 선택이 **없을 때만** OS 변경을 따라간다(부트스트랩이 matchMedia 를
 *   구독한다). 토글로 고른 값이 있으면 그 선택이 이긴다.
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
 * 저장된 선택이 없을 때의 동작.
 *
 * `"system"` 은 **적용 테마가 아니다** — 부트스트랩이 OS 선호를 읽어 light/dark
 * 중 하나로 바꿔 속성에 박는다. `resolveTheme` 이 그 변환을 정의한다.
 *
 * `public/theme-init.js` 가 같은 계약을 따로 구현하고 있다(번들 밖이라 import 가
 * 닿지 않는다). 둘이 어긋나는지는 theme.test.ts 가 검사한다.
 */
export const DEFAULT_THEME: ThemeMode = "system";

/**
 * 저장된 모드와 OS 선호를 합쳐 실제로 적용될 테마를 정한다.
 *
 * 부트스트랩(`public/theme-init.js`)은 번들 밖이라 이 함수를 import 할 수 없어
 * 같은 규칙을 직접 구현한다. 그래서 이 함수는 **그 규칙의 명세이자 테스트 대상**이고,
 * 설정 화면에 3선택 컨트롤을 낼 때 그대로 쓴다.
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
