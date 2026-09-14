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
 * ⚠️ 아래 localStorage 키와 기본값은 src/shared/theme/theme.ts 의
 *    THEME_STORAGE_KEY · DEFAULT_THEME 과 같아야 한다. 어긋나면 토글이 쓴 값을
 *    이 스크립트가 못 읽어 새로고침할 때마다 테마가 풀린다.
 *    src/shared/theme/theme.test.ts 가 두 값이 같은지 검사한다.
 *
 * **기본값은 다크다.** 저장된 값이 없으면 OS 설정을 따르지 않고 다크를 칠한다.
 * 이 서비스의 주 화면이 위성 관측 데이터라 어두운 배경이 기준 디자인이고,
 * 라이트로 시작했다가 사용자가 토글하는 것보다 처음부터 의도한 화면을 보여주는
 * 편이 맞다. 라이트를 원하는 사용자는 토글 한 번이면 되고 그 선택은 저장된다.
 *
 * 그래서 속성을 **항상** 세팅한다. 예전처럼 속성을 지워 OS 설정에 맡기면
 * 라이트 OS 사용자가 기본 다크를 볼 수 없다.
 *
 * try/catch 로 감싸고 실패 시 기본값으로 넘어가는 것은 증상 은폐가 아니라 브라우저
 * 계약이다 — 쿠키를 막은 Safari 프라이빗 모드에서는 localStorage 에 접근하는 것만
 * 으로 SecurityError 가 난다. 그때도 기본값(다크)은 칠해져야 한다.
 */
(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("safe-farm-theme");
  } catch {
    // 위 주석 참고: 접근 자체가 던지는 환경에서도 기본값은 적용한다.
    // (optional catch binding 은 2019년 이후 모든 브라우저가 지원한다.)
  }
  // 명시적으로 저장된 "light" 만 라이트다. 그 외(없음·"dark"·쓰레기값)는 전부 다크.
  document.documentElement.setAttribute(
    "data-theme",
    stored === "light" ? "light" : "dark",
  );
})();
