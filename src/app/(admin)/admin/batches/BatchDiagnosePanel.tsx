"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { BatchDiagnosis, InsightFinding } from "@/shared/aiService/client";
import { diagnoseBatches } from "./actions";

function Findings({ title, items }: { title: string; items: InsightFinding[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium text-sm">{title}</h3>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm">
        {items.map((f) => (
          <li key={f.text}>
            {f.text}{" "}
            <span className="font-mono text-fg-subtle text-xs">[{f.evidence.join(", ")}]</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BatchDiagnosePanel() {
  const [diagnosis, setDiagnosis] = useState<BatchDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await diagnoseBatches();
      if (result.ok) {
        setDiagnosis(result.data);
        setError(null);
      } else {
        setError(result.detail ?? result.reason);
      }
    });

  return (
    <Card title="AI 배치 진단">
      <div className="flex flex-col gap-4">
        <Button loading={pending} onClick={run} size="sm" variant="secondary">
          {diagnosis ? "다시 진단" : "실패·지연 원인 진단"}
        </Button>
        {error && <p className="text-sm text-unsuitable">{error}</p>}
        {diagnosis && (
          <>
            <Findings items={diagnosis.causes} title="원인" />
            <Findings items={diagnosis.actions} title="조치" />
            <p className="text-fg-muted text-xs">근거 검증 탈락 {diagnosis.dropped}건</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted">
                진단에 쓴 사실 {diagnosis.facts.length}건 (검증 기준)
              </summary>
              <ul className="mt-2 flex flex-col gap-0.5 font-mono text-xs">
                {diagnosis.facts.map((f) => (
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
