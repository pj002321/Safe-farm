"use client";

import { useState, useTransition } from "react";
import { loadWeeklyBriefing } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { WeeklyBriefing } from "@/shared/aiService/client";

export function BriefingPanel() {
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await loadWeeklyBriefing();
      if (result.ok) {
        setBriefing(result.data);
        setError(null);
      } else {
        setError(result.detail ?? result.reason);
      }
    });

  return (
    <Card title="AI 주간 운영 브리핑">
      <div className="flex flex-col gap-4">
        <Button loading={pending} onClick={run} size="sm" variant="secondary">
          {briefing ? "다시 작성" : "이번 주 브리핑 작성"}
        </Button>
        {error && <p className="text-sm text-unsuitable">{error}</p>}
        {briefing && (
          <>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {briefing.points.map((p) => (
                <li key={p.text}>
                  {p.text}{" "}
                  <span className="font-mono text-fg-subtle text-xs">
                    [{p.evidence.join(", ")}]
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-fg-muted text-xs">
              근거·숫자 검증 탈락 {briefing.dropped}건
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted">
                브리핑에 쓴 지표 (검증 기준)
              </summary>
              <table className="mt-2 font-mono text-xs">
                <tbody>
                  {briefing.metrics.map((m) => (
                    <tr key={m.id}>
                      <td className="pr-3 text-fg-subtle">[{m.id}]</td>
                      <td className="pr-3">{m.label}</td>
                      <td className="pr-3 tabular-nums">이번 주 {m.cur}</td>
                      <td className="text-fg-muted tabular-nums">
                        지난주 {m.prev}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}
