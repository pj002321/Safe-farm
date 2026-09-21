import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { listAccounts } from "@/shared/auth/accounts";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 회원 관리  →  /admin/members   (V1-120)
 *
 * [Description]
 * - 원래 `/admin` 홈에 있던 계정 표를 정의서의 자리로 옮긴 것이다. 지금 이 화면이
 *   하는 일은 **권한 현황을 보여주는 것 하나**다. 여기서 권한을 바꾸는 버튼을
 *   두지 않았다 — 관리자 임명은 서비스 계정 키를 가진 사람만 할 수 있어야 하고
 *   (`npm run role`), 화면에 두면 그 화면 자체가 권한 상승 경로가 된다.
 * - 정의서가 요구하는 요금제 · 텃밭 수 · 최근 접속 · 검색은 **아직 없다.**
 *   `listAccounts()` 가 Auth 사용자만 보기 때문이다. 붙일 때는 `accounts.ts` 가
 *   `profiles`·`plots` 를 함께 읽어야 한다.
 * - 접근 차단은 세 겹이다: proxy(UX 리다이렉트) → (admin)/layout.tsx
 *   (`requireAdminOrRedirect`) → 데이터를 만지는 액션(각자 `requireAdmin`).
 *   앞의 둘은 편의고, **보안 경계는 마지막 하나**다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "회원 관리" };

/** 사용자 목록은 매 요청 최신이어야 한다 — 권한을 바꾸고 새로고침하면 보여야 한다. */
export const dynamic = "force-dynamic";

export default async function AdminMembers() {
  const viewer = await requireAdminOrRedirect();
  const accounts = await listAccounts();

  const admins = accounts.filter((account) => account.role === "admin");

  return (
    <AdminPage
      descriptionKo={
        <>
          전체 계정과 권한 현황입니다. 권한 변경은 서비스 계정 키가 있어야 하며{" "}
          <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
            npm run role -- grant &lt;email&gt;
          </code>{" "}
          로 합니다.
        </>
      }
      titleKo="회원 관리"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="전체 계정">
          <span className="font-mono text-2xl tabular-nums">
            {accounts.length}
          </span>
        </Card>
        <Card title="관리자">
          <span className="font-mono text-2xl text-accent tabular-nums">
            {admins.length}
          </span>
        </Card>
        <Card title="현재 계정">
          <span className="font-mono text-sm">{viewer.email ?? viewer.id}</span>
        </Card>
      </div>

      {accounts.length === 0 ? (
        // 빈 상태를 빈 표로 두지 않는다 — "아직 아무도 없는 것"과 "불러오기 실패"를
        // 화면에서 구분할 수 있어야 한다.
        <Card tone="default">
          <p className="text-fg-muted">
            아직 가입한 계정이 없습니다. 로그인 화면에서 첫 계정을 만들어
            보세요.
          </p>
        </Card>
      ) : (
        <Card padding="sm" tone="elevated">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                가입한 계정과 권한, 로그인 수단 목록
              </caption>
              <thead>
                <tr className="border-border border-b text-fg-muted text-xs">
                  <th className="px-3 py-2 text-left font-medium" scope="col">
                    이메일
                  </th>
                  <th className="px-3 py-2 text-left font-medium" scope="col">
                    권한
                  </th>
                  <th className="px-3 py-2 text-left font-medium" scope="col">
                    로그인 수단
                  </th>
                  <th className="px-3 py-2 text-left font-medium" scope="col">
                    가입일
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    className="border-border/60 border-b last:border-0"
                    key={account.id}
                  >
                    <th
                      className="px-3 py-2.5 text-left font-normal"
                      scope="row"
                    >
                      {/* 상세로 가는 유일한 입구. 이메일이 없어도 id 로는 갈 수 있어야 한다. */}
                      <Link
                        className="underline decoration-border underline-offset-2 hover:text-accent"
                        href={`/admin/members/${account.id}`}
                      >
                        {account.email ?? (
                          <span className="text-fg-subtle">(이메일 없음)</span>
                        )}
                      </Link>
                    </th>
                    <td className="px-3 py-2.5">
                      <Badge
                        size="sm"
                        tone={account.role === "admin" ? "accent" : "neutral"}
                      >
                        {account.role === "admin" ? "관리자" : "사용자"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-fg-muted text-xs">
                      {account.providers.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-fg-muted text-xs tabular-nums">
                      {account.createdAtKo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AdminPage>
  );
}
