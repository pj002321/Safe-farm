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
 * **기본값은 "system" 이다.** 저장된 선택이 없으면 OS 설정을 그대로 따른다.
 * 예전에는 다크로 고정했는데, 라이트 OS 를 쓰는 사람이 사이트에 들어올 때마다
 * 어두운 화면을 받고 매번 토글해야 했다. 기기 설정을 존중하는 편이 맞다.
 *
 * 그래도 속성은 **항상** 세팅한다. 지우고 CSS 의 prefers-color-scheme 에 맡기면
 * 토글이 현재 테마를 읽을 곳이 없어지고, 첫 페인트 이전 보장도 CSS 쪽으로 넘어간다.
 * 여기서 OS 선호를 읽어 값으로 박아 두는 편이 한 곳에서 끝난다.
 *
 * 저장된 선택이 **없을 때만** OS 변경을 따라간다. 사용자가 토글로 고른 값이
 * 있으면 그 선택이 이긴다 — 명시적 선택을 OS 설정이 덮으면 안 된다.
 *
 * try/catch 로 감싸고 실패 시 기본값으로 넘어가는 것은 증상 은폐가 아니라 브라우저
 * 계약이다 — 쿠키를 막은 Safari 프라이빗 모드에서는 localStorage 에 접근하는 것만
 * 으로 SecurityError 가 난다. 그때도 화면은 칠해져야 한다.
 */
(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("safe-farm-theme");
  } catch {
    // 위 주석 참고: 접근 자체가 던지는 환경에서도 테마는 적용한다.
    // (optional catch binding 은 2019년 이후 모든 브라우저가 지원한다.)
  }

  const chosen = stored === "light" || stored === "dark" ? stored : null;

  // matchMedia 가 없는 환경(아주 오래된 브라우저, 일부 웹뷰)에서는 라이트로 둔다.
  // 본문이 밝은 배경 위 어두운 글씨라 읽히지 않는 쪽으로 떨어지지 않는다.
  const media =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  const apply = () => {
    document.documentElement.setAttribute(
      "data-theme",
      chosen ?? (media?.matches ? "dark" : "light"),
    );
  };

  apply();

  // 고른 값이 없을 때만 OS 를 따라간다. 시스템 설정을 바꾸면 새로고침 없이 바뀐다.
  if (!chosen && media) {
    // addEventListener 가 없는 옛 Safari 를 위해 addListener 로 물러난다.
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
    } else if (typeof media.addListener === "function") {
      media.addListener(apply);
    }
  }
})();
