/*
 * 첫 페인트 전에 실행돼 테마 깜빡임(FOUC)을 막는 부트스트랩.
 *
 * 왜 React 컴포넌트 안의 인라인 <script> 가 아니라 정적 파일인가:
 *  - React 19 는 컴포넌트가 그린 <script> 를 보면 콘솔 경고를 낸다.
 *  - next/script 의 beforeInteractive 는 __next_s 큐에 넣고 프레임워크 런타임이
 *    꺼내 쓰는데, head 의 프레임워크 스크립트가 전부 async 라 첫 페인트보다
 *    늦게 실행될 수 있다. 그러면 깜빡임을 막으려던 목적 자체가 깨진다.
 *  - src 를 가진 일반 <script> 는 파싱을 막고 즉시 실행된다(async/defer 없음).
 *    이것만이 "첫 페인트 이전"을 보장한다.
 *
 * ⚠️ 아래 localStorage 키는 src/shared/theme/theme.ts 의 THEME_STORAGE_KEY 와
 *    같아야 한다. 어긋나면 토글이 쓴 값을 이 스크립트가 못 읽어 새로고침할 때마다
 *    테마가 풀린다. src/shared/theme/theme.test.ts 가 두 값이 같은지 검사한다.
 *
 * try/catch 로 감싸고 실패 시 아무것도 하지 않는 것은 증상 은폐가 아니라 브라우저
 * 계약이다 — 쿠키를 막은 Safari 프라이빗 모드에서는 localStorage 에 접근하는 것만
 * 으로 SecurityError 가 난다. 그때는 속성을 건드리지 않고 OS 설정에 맡기는 것이 맞다.
 */
(() => {
  try {
    const stored = localStorage.getItem("safe-farm-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch {
    // 위 주석 참고: 접근 자체가 던지는 환경에서는 OS 설정에 맡긴다.
    // (optional catch binding 은 2019년 이후 모든 브라우저가 지원한다.)
  }
})();
