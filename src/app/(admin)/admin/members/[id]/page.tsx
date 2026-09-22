import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { getAccount } from "@/shared/auth/accounts";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 회원 상세  →  /admin/members/[id]   (V1-122 의 앞부분)
 *
 * [Description]
 * - 회원 관리 표의 이메일을 누르면 오는 곳. 지금은 목록이 보여주는 네 가지에
 *   계정 id 를 더한 것뿐이다 — 자리를 먼저 만든 것이고, 정의서가 요구하는
 *   **마스킹 해제와 접근 로그**는 아직 없다. 로그 없이 원본을 보여주는 상태이므로
 *   그 둘이 붙기 전까지는 목록과 같은 정보만 둔다.
 * - 없는 id 는 `notFound()` — `getAccount` 가 null 을 주면 404 다. 남의 밭 id 에
 *   빈 화면이 아니라 404 를 내는 `plots/[id]` 와 같은 태도다.
 * - `params` 는 Promise 다(Next 16). `await` 없이 꺼내면 타입이 막는다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "회원 상세" };

/** 목록과 같은 이유 — 권한을 바꾸고 새로고침하면 보여야 한다. */
export const dynamic = "force-dynamic";

export default async function AdminMemberDetail({
  params,
}: PageProps<"/admin/members/[id]">) {
  await requireAdminOrRedirect();
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link
          className="text-fg-muted text-sm underline hover:text-accent"
          href="/admin/members"
        >
          ← 회원 관리
        </Link>
        <h1 className="mt-2 font-semibold text-2xl tracking-tight">
          {account.email ?? (
            <span className="text-fg-subtle">(이메일 없음)</span>
          )}
        </h1>
      </div>

      <Card padding="md" tone="elevated">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted text-xs">권한</dt>
            <dd className="mt-1">
              <Badge
                size="sm"
                tone={account.role === "admin" ? "accent" : "neutral"}
              >
                {account.role === "admin" ? "관리자" : "사용자"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs">로그인 수단</dt>
            <dd className="mt-1 font-mono text-xs">
              {account.providers.join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs">가입일</dt>
            <dd className="mt-1 font-mono text-xs tabular-nums">
              {account.createdAtKo}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs">계정 id</dt>
            <dd className="mt-1 font-mono text-xs">{account.id}</dd>
          </div>
        </dl>
      </Card>
    </main>
  );
}
