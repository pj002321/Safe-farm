import { login } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 로그인  →  /login
 *
 * [Description]
 * - proxy가 미로그인 요청을 여기로 보낸다. PUBLIC_PATHS에 포함돼 있어야 한다.
 * - 라우트 그룹 밖에 둔다. 사용자 셸(헤더)을 씌우지 않기 위해서다.
 * ---------------------------------------------
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="font-bold text-2xl text-accent">Safe Farm AI</h1>
      <form action={login} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-fg-muted text-sm">이메일</span>
          <input
            name="email"
            type="email"
            required
            className="rounded-md border border-border bg-surface p-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-muted text-sm">비밀번호</span>
          <input
            name="password"
            type="password"
            required
            className="rounded-md border border-border bg-surface p-2"
          />
        </label>
        <button type="submit" className="rounded-md bg-accent p-2 text-bg">
          로그인
        </button>
      </form>
    </main>
  );
}
