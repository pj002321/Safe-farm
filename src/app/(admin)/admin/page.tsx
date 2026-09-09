import { requireAdminOrRedirect } from "@/shared/auth/session";

export default async function AdminHome() {
  const viewer = await requireAdminOrRedirect();

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="font-bold text-2xl">관리자</h1>
      <p className="mt-2 text-fg-muted">
        전체 농지·사용자·예측 잡 현황을 관리합니다.
      </p>
      <dl className="mt-6 rounded-md border border-border bg-surface p-4 text-sm">
        <dt className="text-fg-muted">현재 계정</dt>
        <dd className="font-mono">{viewer.email}</dd>
        <dt className="mt-2 text-fg-muted">role (app_metadata)</dt>
        <dd className="font-mono text-accent">{viewer.role}</dd>
      </dl>
    </main>
  );
}
