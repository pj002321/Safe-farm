"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { RetrievalEval } from "@/shared/aiService/client";
import { runRetrievalEval } from "./actions";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function RetrievalEvalPanel() {
  const [result, setResult] = useState<RetrievalEval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const r = await runRetrievalEval();
      if (r.ok) {
        setResult(r.data);
        setError(null);
      } else {
        setError(r.detail ?? r.reason);
      }
    });

  const missed = result?.questions.filter((q) => q.C === 0) ?? [];

  return (
    <Card title="검색 품질 · 3군 비교">
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-fg-muted text-xs">
          골든셋 질문으로 검색만 돌려 기대한 출처가 상위 결과에 오는지 잽니다. 세 군은 같은 질의 벡터를 쓰고
          뒤처리만 다릅니다. 문항마다 임베딩 1회 비용이 들고 LLM 은 부르지 않습니다.
        </p>
        <Button loading={pending} onClick={run} size="sm" variant="secondary">
          {result ? "다시 측정" : "측정 실행"}
        </Button>
        {error && <p className="text-unsuitable">{error}</p>}
        {result && (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-border border-b text-fg-muted text-xs">
                  <th className="py-1 pr-3 text-left font-medium" scope="col">군</th>
                  <th className="py-1 pr-3 text-right font-medium" scope="col">Recall@{result.k}</th>
                  <th className="py-1 pr-3 text-right font-medium" scope="col">MRR</th>
                  <th className="py-1 text-right font-medium" scope="col">근거 문구@{result.k}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {result.arms.map((arm) => (
                  <tr className="border-border/60 border-b last:border-0" key={arm.key}>
                    <th className="py-1.5 pr-3 text-left font-normal" scope="row">
                      <span className="font-mono text-fg-subtle text-xs">{arm.key}</span> {arm.label}
                    </th>
                    <td className="py-1.5 pr-3 text-right">{pct(arm.recall)}</td>
                    <td className="py-1.5 pr-3 text-right">{arm.mrr.toFixed(3)}</td>
                    <td className="py-1.5 text-right">{pct(arm.hint)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-fg-subtle text-xs">
              문항 {result.arms[0]?.n}개. Recall 은 기대 출처가 상위 {result.k}개 안에 있는 비율, MRR 은 그 첫
              순위의 역수 평균, 근거 문구는 기대한 낱말이 LLM 이 받는 본문에 들어간 비율입니다.
            </p>
            {missed.length > 0 && (
              <details>
                <summary className="cursor-pointer text-fg-muted">운영(C)이 놓친 문항 {missed.length}개</summary>
                <ul className="mt-2 flex flex-col gap-1 text-xs">
                  {missed.map((q) => (
                    <li key={q.question}>
                      {q.question} <span className="font-mono text-fg-subtle">→ 기대 {q.expected}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
