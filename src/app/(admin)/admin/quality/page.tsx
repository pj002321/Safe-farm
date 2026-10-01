import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { Card } from "@/components/shared/Card";
import { type AskRow, getAskQuality} from "@/features/admin/qualityStore"
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";
import { aiService } from "@/shared/aiService/client";
import { EmbedMissingButton } from "@/components/admin/EmbedMissingButton";
import { QuestionTrendPanel } from "@/components/admin/QuestionTrendPanel";
import { RetrievalEvalPanel } from "@/components/admin/RetrievalEvalPanel";

/**
 * ---------------------------------------------
 * [Feature]: 품질 관리  →  /admin/quality   (V1-111~116)
 *
 * [Description]
 * - V1-111(문서 인덱스)은 ai-service 가 documents·chunks 를 세어 준다. 임베딩이 빠진
 *   조각이 있으면 그 출처는 검색에서 일부가 안 보인다는 뜻이다.
 * - V1-114(답변 평가)·V1-116(가드레일 로그)는 `ask_history` 만 읽어 선다
 *   (`features/admin/qualityStore.ts`). 최근 7일(KST) 기준.
 * - 검색 지표(V1-113)·3군 비교(V1-115)는 버튼을 눌렀을 때만 돈다 — 문항마다 임베딩 비용이
 *   든다(LLM 은 안 부른다). 결과를 저장하지 않는다. 추이를 보려면 저장 표가 필요하다.
 * - 재색인(V1-112)은 **임베딩이 빠진 조각만** 채운다. 전량 재임베딩은 요금과 검색 공백이
 *   커서 화면에 두지 않는다(`pipeline.doc.embed --full`).
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "품질 관리" };

export const dynamic = "force-dynamic";


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
  const [quality, index] = await Promise.all([
    getAskQuality(),
    aiService.indexStatus(),
  ]);

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

      <QuestionTrendPanel />

      <Card title="👎 받은 답변">
        <AskList empty="최근 7일 👎 가 없습니다." rows={quality.recentDown} />
      </Card>

      <Card title="가드레일 차단">
        <AskList empty="최근 7일 차단이 없습니다." rows={quality.recentBlocked} />
      </Card>

      <Card title="문서 인덱스">
        {!index.ok ? (
          <p className="text-sm text-unsuitable">
            ai-service 에서 못 읽었습니다: {index.detail ?? index.reason}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-fg-muted text-xs">
                <th className="py-1 pr-3 text-left font-medium" scope="col">출처</th>
                <th className="py-1 pr-3 text-right font-medium" scope="col">문서</th>
                <th className="py-1 pr-3 text-right font-medium" scope="col">조각</th>
                <th className="py-1 pr-3 text-right font-medium" scope="col">임베딩</th>
                <th className="py-1 text-left font-medium" scope="col">최근 적재</th>
              </tr>
            </thead>
            <tbody>
              {index.data.sources.map((s) => (
                <tr className="border-border/60 border-b last:border-0" key={s.source}>
                  <td className="py-1.5 pr-3 font-mono text-xs">{s.source}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.documents}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.chunks}</td>
                  <td
                    className={`py-1.5 pr-3 text-right tabular-nums${
                      s.embedded < s.chunks ? " text-unsuitable" : ""
                    }`}
                  >
                    {s.embedded}
                  </td>
                  <td className="py-1.5 font-mono text-fg-muted text-xs tabular-nums">
                    {s.latest ? dateFormat.format(new Date(s.latest)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {index.ok && (
          <EmbedMissingButton
            missing={index.data.sources.reduce((sum, x) => sum + x.chunks - x.embedded, 0)}
          />
        )}
      </Card>

      <RetrievalEvalPanel />
    </AdminPage>
  );
}
