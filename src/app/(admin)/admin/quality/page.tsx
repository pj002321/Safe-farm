import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { Card } from "@/components/shared/Card";
import { type AskRow, getAskQuality} from "@/features/admin/qualityStore"
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";

/**
 * ---------------------------------------------
 * [Feature]: 품질 관리  →  /admin/quality   (V1-111~116)
 *
 * [Description]
 * - V1-114(답변 평가)·V1-116(가드레일 로그)는 `ask_history` 만 읽어 선다
 *   (`features/admin/qualityStore.ts`). 최근 7일(KST) 기준.
 * - 나머지는 자리만 있다. 검색 지표(V1-113·115)는 골든셋 측정에서 나오는데 **호출마다
 *   임베딩 비용이 든다.** 사람이 돌린 결과를 저장해 두고 화면은 읽기만 해야 한다.
 * - 재색인(V1-112)도 같은 이유로 버튼 한 번에 전체를 돌리는 액션이 되면 안 된다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "품질 관리" };

export const dynamic = "force-dynamic";

const PLANNED = [
  { code: "V1-111", nameKo: "문서 인덱스 현황" },
  { code: "V1-112", nameKo: "재색인 실행" },
  { code: "V1-113", nameKo: "검색 품질 지표 (Recall@k · MRR)" },
  { code: "V1-115", nameKo: "실험 비교 (3군)" },
] as const;

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card title={label}>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
    </Card>
  );
}

function AskList({ rows, empty }: { rows: AskRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-fg-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => (
        <li className="flex flex-col gap-1 py-2" key={row.id}>
          <span className="text-fg-muted text-xs">
            {dateFormat.format(new Date(row.createdAt))}
          </span>
          <span className="font-medium">{row.question}</span>
          {row.answer && (
            <details>
              <summary className="cursor-pointer text-fg-muted text-xs">
                답변 보기
              </summary>
              <p className="mt-1 whitespace-pre-wrap">{row.answer}</p>
            </details>
          )}
          {row.feedbackReason && (
            <span className="text-unsuitable">사유: {row.feedbackReason}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function AdminQuality() {
  await requireAdminOrRedirect();
  const quality = await getAskQuality();

  const rated = quality.up + quality.down;
  const upRate = rated === 0 ? "—" : `${Math.round((quality.up / rated) * 100)}%`;

  return (
    <AdminPage
      descriptionKo="최근 7일 AI 답변의 평가와 가드레일 차단을 봅니다."
      titleKo="품질 관리"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="질문 수" value={quality.total} />
        <Metric label="👍 비율" value={upRate} />
        <Metric label="👎" value={quality.down} />
        <Metric label="가드레일 차단" value={quality.blocked} />
      </div>

      <Card title="👎 받은 답변 (V1-114)">
        <AskList empty="최근 7일 👎 가 없습니다." rows={quality.recentDown} />
      </Card>

      <Card title="가드레일 차단 (V1-116)">
        <AskList empty="최근 7일 차단이 없습니다." rows={quality.recentBlocked} />
      </Card>

      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
