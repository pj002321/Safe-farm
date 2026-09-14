import { THEME_INIT_SRC } from "@/shared/theme/theme";

/**
 * ---------------------------------------------
 * [Feature]: 테마 부트스트랩 스크립트
 *
 * [Description]
 * - 첫 페인트보다 먼저 뛰어 FOUC(테마 깜빡임)를 막는 것이 전부다. React 가
 *   하이드레이션한 뒤에 테마를 칠하면 다크 사용자에게 라이트 화면이 한 프레임
 *   번쩍인다.
 * - **`src` 를 가진 일반 script 여야 한다.** 앞서 두 방식을 시도했고 둘 다 문제가 있었다:
 *   1. 인라인 `<script dangerouslySetInnerHTML>` — HTML 에는 제대로 들어가 동작하지만
 *      React 19 가 콘솔 경고를 낸다("Scripts inside React components are never
 *      executed when rendering on the client"). 클라이언트 재렌더 시 실행되지
 *      않는다는 경고로, 최초 1회만 필요한 이 용도에선 기능상 무해했으나 노이즈다.
 *   2. `next/script` 의 `beforeInteractive` — 경고는 사라지지만 스크립트가
 *      `__next_s` 큐에 실려 프레임워크 런타임이 꺼내 쓴다. head 의 프레임워크
 *      스크립트가 전부 `async` 라 첫 페인트보다 늦게 실행될 수 있어, 막으려던
 *      깜빡임이 되돌아온다.
 *   `async`/`defer` 없는 `<script src>` 는 파서를 멈추고 즉시 실행되므로
 *   "첫 페인트 이전"이 문법적으로 보장된다. React 도 이 형태는 경고하지 않는다.
 * - 비용은 요청 하나. 같은 오리진의 작은 정적 파일이고 캐시되므로 무시할 수준이다.
 * - 서버 컴포넌트로 둔다. "use client" 를 붙이면 번들에 들어가 늦게 실행돼
 *   목적 자체가 깨진다.
 *
 * [Usage]
 * ```tsx
 * <head>
 *   <ThemeScript />
 * </head>
 * ```
 * ---------------------------------------------
 */
export function ThemeScript() {
  return <script src={THEME_INIT_SRC} />;
}
