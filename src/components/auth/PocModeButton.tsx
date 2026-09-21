/**
 * ---------------------------------------------
 * [Feature]: POC 모드로 시작하기 — 시연용 자동 로그인 버튼
 *
 * [Description]
 * - 누르면 시연 계정 하나로 로그인해 홈으로 간다. 무엇을 보여주는 서비스인지
 *   가입 없이 보게 하는 입구다.
 * - **폼 제출이다.** `"use client"` 가 없고 JS 없이도 동작한다 — 로그인 화면의
 *   다른 요소와 같은 방침이다. 계정을 고르는 것도, 로그인도 서버가 한다
 *   (`src/app/api/auth/poc/route.ts`).
 * - **비밀번호가 여기 없다.** 이 컴포넌트는 브라우저로 내려가므로, 값이 있으면
 *   누구나 읽는다. 서버가 환경변수에서 읽어 쓴다.
 * - 버튼을 조건부로 숨기지 않는다. 숨기려면 이 서버 컴포넌트가 환경변수를
 *   봐야 하는데, 그러면 "기능이 꺼져 있다"는 사실이 화면에 드러난다.
 *   꺼져 있으면 라우트가 404 를 주고 사용자는 로그인 화면으로 돌아온다.
 *
 * [Usage]
 * ```tsx
 * <PocModeButton />
 * ```
 * ---------------------------------------------
 */

export function PocModeButton() {
  return (
    <form action="/api/auth/poc" method="post">
      <button
        className="min-h-11 w-full rounded-lg border border-border border-dashed bg-surface-2/40 px-4 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        type="submit"
      >
        POC 모드로 시작하기
      </button>
      <p className="mt-2 text-center text-[0.7rem] text-fg-subtle">
        가입 없이 시연용 농장 자료로 둘러봅니다.
      </p>
    </form>
  );
}
