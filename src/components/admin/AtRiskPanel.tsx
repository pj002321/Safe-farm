"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadAtRiskReport } from "@/app/(admin)/admin/members/actions";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

type Report = Extract<
  Awaited<ReturnType<typeof loadAtRiskReport>>,
  { ok: true }
>["data"];

export function AtRiskPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await loadAtRiskReport();
      if (result.ok) {
        setReport(result.data);
        setError(null);
      } else {
        setError(result.detail ?? result.reason);
      }
    });

  return (
    <Card title="AI 위험 회원 리포트">
      <div className="flex flex-col gap-4">
        <Button loading={pending} onClick={run} size="sm" variant="secondary">
          {report ? "다시 분석" : "위험 회원 찾기"}
        </Button>
        {error && <p className="text-sm text-unsuitable">{error}</p>}
        {report && report.members.length === 0 && (
          <p className="text-fg-muted text-sm">
            지금 챙겨야 할 회원이 없습니다.
          </p>
        )}
        {report && report.members.length > 0 && (
          <ul className="flex flex-col gap-4">
            {report.members.map((m) => (
              <li className="text-sm" key={m.userId}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" tone="unsuitable">
                    위험 {m.score}
                  </Badge>
                  <Link
                    className="underline decoration-border underline-offset-2 hover:text-accent"
                    href={`/admin/members/${m.userId}`}
                  >
                    {m.email ?? m.userId}
                  </Link>
                  <span className="text-fg-subtle text-xs">
                    {m.plots.join(", ")}
                  </span>
                </div>
                <p className="mt-1 text-fg-muted">{m.reasons.join(" · ")}</p>
                {m.draft && (
                  <p className="mt-1 rounded-sm bg-surface-2 px-2 py-1">
                    <span className="text-fg-subtle text-xs">
                      안내문 초안 ·{" "}
                    </span>
                    {m.draft}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
