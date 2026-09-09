import { logout } from "@/app/login/actions";
import { getViewer } from "@/shared/auth/session";

export default async function Home() {
  const viewer = await getViewer();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="font-bold text-2xl text-accent">Safe Farm AI</h1>
        <p className="mt-2 text-fg-muted">
          농작물 상태와 날씨를 읽어 재배 적합도를 추천합니다.
        </p>
      </div>

      {/* 역할별 화면 분기 예시 */}
      {viewer?.isAdmin ? (
        <div className="rounded-md border border-border bg-accent-subtle p-4">
          <p className="text-sm">
            관리자 계정입니다. 상단 <b>관리자</b> 메뉴에서 전체 현황을 볼 수
            있습니다.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-fg-muted text-sm">
            등록한 농지의 기상 조건으로 적합도를 계산합니다.
          </p>
        </div>
      )}

      <form action={logout}>
        <button type="submit" className="text-fg-muted text-sm underline">
          로그아웃
        </button>
      </form>
    </main>
  );
}
