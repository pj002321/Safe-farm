"use client";

import { useState, useTransition } from "react";
import { analyzeMember } from "@/app/(admin)/admin/members/[id]/actions";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { InsightFinding, MemberInsight } from "@/shared/aiService/client";

const SEGMENT_TONE = {
  활발: "good",
  정착중: "info",
  이탈위험: "unsuitable",
  휴면: "caution",
} as const;

function Findings({
  title,
  items,
}: {
  title: string;
  items: InsightFinding[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium text-sm">{title}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {items.map((f) => (
          <li key={f.text}>
            {f.text}{" "}
            <span className="font-mono text-fg-subtle text-xs">
              [{f.evidence.join(", ")}]
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MemberInsightPanel({ userId }: { userId: string }) {
  const [insight, setInsight] = useState<MemberInsight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await analyzeMember(userId);
      if (result.ok) {
        setInsight(result.data);
        setError(null);
      } else {
        setError(result.detail ?? result.reason);
      }
    });

  return (
    <Card padding="md" title="AI 회원 분석" tone="elevated">
      <div className="flex flex-col gap-4">
        <Button loading={pending} onClick={run} size="sm" variant="secondary">
          {insight ? "다시 분석" : "최근 30일 분석"}
        </Button>
        {error && <p className="text-sm text-unsuitable">{error}</p>}
        {insight && (
          <>
            <div className="flex items-center gap-2">
              {insight.segment && (
                <Badge size="sm" tone={SEGMENT_TONE[insight.segment]}>
                  {insight.segment}
                </Badge>
              )}
              <span className="text-fg-muted text-xs">
                근거 검증 탈락 {insight.dropped}건
              </span>
            </div>
            <p className="text-sm">{insight.summary}</p>
            <Findings items={insight.risks} title="위험" />
            <Findings items={insight.actions} title="운영 액션" />
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted">
                분석에 쓴 실제 기록 {insight.facts.length}건 (검증 기준)
              </summary>
              <ul className="mt-2 flex flex-col gap-0.5 font-mono text-xs">
                {insight.facts.map((f) => (
                  <li key={f.id}>
                    [{f.id}] {f.text}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}
