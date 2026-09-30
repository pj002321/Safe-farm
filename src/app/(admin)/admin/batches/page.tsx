import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";
import { aiService } from "@/shared/aiService/client";
import { BatchDiagnosePanel } from "./BatchDiagnosePanel";

/**
 * ---------------------------------------------
 * [Feature]: 배치 관리  →  /admin/batches   (V1-103~107)
 *
 * [Description]
 * - pg_cron·pg_net 스키마는 PostgREST 에 없어서 ai-service 가 DB 에서 직접 읽어 준다
 *   (`ai-service/app/service/ops_status.py`).
 * - **cron 의 "성공"을 믿지 않는다.** pg_cron 은 HTTP 요청을 큐에 넣으면 성공이다.
 *   실제 결과(`net._http_response`)와 데이터가 실제로 새로 들어왔는지(신선도)를 같이 본다.
 *   HTTP 결과는 pg_net 이 몇 시간만 보관한다 — 길게 보려면 적재 표가 필요하다.
 * - 재실행(V1-104)은 버튼이 생기는 순간 Server Action 이고, 그 파일 첫 줄이
 *   `requireAdmin()` 이어야 한다. 레이아웃 검사는 액션에 미치지 않는다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "배치 관리" };

export const dynamic = "force-dynamic";

const PLANNED = [
  { code: "V1-104", nameKo: "수동 재실행 (기간 지정)" },
  { code: "V1-106", nameKo: "API 호출량 추이" },
] as const;

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const at = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "—");

export default async function AdminBatches() {
  await requireAdminOrRedirect();
  const result = await aiService.batchStatus();

  return (
    <AdminPage
      descriptionKo="무엇이 돌았고 무엇이 비었는지를 보는 자리입니다. 시각은 한국 시간입니다."
      titleKo="배치 관리"
    >
      {!result.ok ? (
        <Card>
          <p className="text-sm text-unsuitable">
            ai-service 에서 상태를 못 읽었습니다: {result.detail ?? result.reason}
          </p>
        </Card>
      ) : (
        <>
          <Card title="데이터 신선도 (V1-105 · V1-107)">
            <table className="w-full text-sm">
              <tbody>
                {result.data.feeds.map((f) => (
                  <tr className="border-border/60 border-b last:border-0" key={f.key}>
                    <td className="py-2 pr-3">{f.label}</td>
                    <td className="py-2 pr-3 font-mono text-xs tabular-nums">{at(f.latest)}</td>
                    <td className="py-2 pr-3">
                      {f.stale === null ? (
                        <Badge size="sm">판정 안 함</Badge>
                      ) : f.stale ? (
                        <Badge size="sm" tone="unsuitable">
                          {f.maxAgeHours}시간 넘게 지연
                        </Badge>
                      ) : (
                        <Badge size="sm" tone="good">
                          정상
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 text-fg-muted text-xs">{f.loader}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <BatchDiagnosePanel />

          <Card title="스케줄 (최근 7일, V1-103)">
            <table className="w-full text-sm">
              <tbody>
                {result.data.cron.map((c) => (
                  <tr className="border-border/60 border-b last:border-0" key={c.jobname}>
                    <td className="py-2 pr-3 font-mono text-xs">{c.jobname}</td>
                    <td className="py-2 pr-3 font-mono text-fg-muted text-xs">{c.schedule}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {c.runs}회{c.failed > 0 && <span className="text-unsuitable"> · 실패 {c.failed}</span>}
                    </td>
                    <td className="py-2 font-mono text-xs tabular-nums">{at(c.last_run)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-fg-subtle text-xs">
              cron 의 실행 횟수는 요청을 보낸 횟수입니다. 실제 성공 여부는 아래 HTTP 결과를 보세요.
            </p>
          </Card>

          <Card title="실제 HTTP 결과 (pg_net 보관분)">
            {result.data.http.length === 0 ? (
              <p className="text-fg-muted text-sm">보관 중인 결과가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {result.data.http.map((h) => (
                  <li className="flex flex-wrap items-center gap-2" key={`${h.at}-${h.job}`}>
                    <span className="font-mono text-xs tabular-nums">{at(h.at)}</span>
                    <span className="font-mono text-xs">{h.job ?? "?"}</span>
                    <Badge size="sm" tone={h.ok ? "good" : "unsuitable"}>
                      {h.status ?? "응답 없음"}
                    </Badge>
                    {h.detail && <span className="text-fg-muted text-xs">{h.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
