import { HourlyBars } from "@/components/admin/HourlyBars";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { aiService } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 시스템 상태 · 오류 로그 (관리자 개요)
 *
 * [Description]
 * - ai-service 가 메모리에 쌓는 요청 기록(`core/ops_log.py`)과 pg_net 의 배치 실패를 읽는다.
 *   **메모리 기록이라 ai-service 가 재시작하면 그때부터 다시 센다** — "집계 시작" 시각을
 *   화면에 같이 보여 주는 이유다. Next 쪽 오류는 여기 없다.
 * - 오류는 심각도(error → warning) 다음 최신순이다.
 * ---------------------------------------------
 */

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const at = (iso: string) => dateFormat.format(new Date(iso));

export async function SystemStatusSection() {
  const result = await aiService.systemStatus();
  if (!result.ok) {
    return (
      <Card title="시스템 상태">
        <p className="text-sm text-unsuitable">
          ai-service 에 연결하지 못했습니다: {result.detail ?? result.reason}
        </p>
      </Card>
    );
  }
  const { requests, staleFeeds, errors, since } = result.data;

  return (
    <>
      <Card title="시스템 상태 (최근 24시간)">
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge dot size="sm" tone="good">
              ai-service 응답 중
            </Badge>
            <Badge dot size="sm" tone={requests.errors ? "unsuitable" : "good"}>
              5xx {requests.errors}건
            </Badge>
            <Badge dot size="sm" tone={staleFeeds.length ? "caution" : "good"}>
              {staleFeeds.length ? `지연 데이터 ${staleFeeds.join(", ")}` : "배치 데이터 정상"}
            </Badge>
            <span className="text-fg-subtle text-xs">집계 시작 {at(since)}</span>
          </div>

          <div>
            <p className="mb-1 text-fg-muted text-xs">
              요청 {requests.count}건 · 평균 {requests.avgMs ?? "—"}ms
            </p>
            <HourlyBars counts={requests.hourly} label="ai-service 요청" />
          </div>

          {requests.routes.length > 0 && (
            <table className="w-full text-xs">
              <caption className="mb-1 text-left text-fg-muted">느린 경로 (p95 순)</caption>
              <thead>
                <tr className="border-border border-b text-fg-muted">
                  <th className="py-1 pr-3 text-left font-medium" scope="col">경로</th>
                  <th className="py-1 pr-3 text-right font-medium" scope="col">호출</th>
                  <th className="py-1 pr-3 text-right font-medium" scope="col">평균</th>
                  <th className="py-1 pr-3 text-right font-medium" scope="col">p95</th>
                  <th className="py-1 text-right font-medium" scope="col">5xx</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {requests.routes.map((r) => (
                  <tr className="border-border/60 border-b last:border-0" key={r.route}>
                    <td className="py-1 pr-3">{r.route}</td>
                    <td className="py-1 pr-3 text-right">{r.count}</td>
                    <td className="py-1 pr-3 text-right">{r.avgMs}ms</td>
                    <td className="py-1 pr-3 text-right">{r.p95Ms}ms</td>
                    <td className={`py-1 text-right${r.errors ? " text-unsuitable" : ""}`}>
                      {r.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card title="오류 로그 (최근 24시간, 심각도순)">
        {errors.length === 0 ? (
          <p className="text-fg-muted text-sm">기록된 오류가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {errors.map((e) => (
              <li className="flex flex-wrap items-baseline gap-2" key={`${e.at}-${e.message}`}>
                <Badge size="sm" tone={e.severity === "error" ? "unsuitable" : "caution"}>
                  {e.severity === "error" ? "오류" : "경고"}
                </Badge>
                <span className="font-mono text-fg-muted text-xs tabular-nums">{at(e.at)}</span>
                <span className="text-fg-muted text-xs">{e.source}</span>
                <span className="break-all">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
