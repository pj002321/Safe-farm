"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { QuestionTrends } from "@/shared/aiService/client";
import { analyzeQuestionTrends } from "./actions";

export function QuestionTrendPanel() {
  const [trends, setTrends] = useState<QuestionTrends | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await analyzeQuestionTrends();
      if (result.ok) {
        setTrends(result.data);
        setError(null);
      } else {
        setError(result.detail ?? result.reason);
      }
    });

  const textOf = new Map(trends?.facts.map((f) => [f.id, f.text]));

  return (
    <Card title="AI 질문 트렌드 · 콘텐츠 공백">
      <div className="flex flex-col gap-4">
        <Button loading={pending} onClick={run} size="sm" variant="secondary">
          {trends ? "다시 분석" : "최근 30일 질문 분석"}
        </Button>
        {error && <p className="text-sm text-unsuitable">{error}</p>}
        {trends && (
          <>
            <p className="text-fg-muted text-xs">
              질문 {trends.total}건 · 미분류 {trends.unassigned}건 · 불만이 많은
              주제가 위로 옵니다
            </p>
            <ul className="flex flex-col gap-3">
              {trends.topics.map((t) => (
                <li className="text-sm" key={t.name}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge size="sm">{t.count}건</Badge>
                    {t.down > 0 && (
                      <Badge size="sm" tone="unsuitable">
                        불만 {t.down}
                      </Badge>
                    )}
                  </div>
                  {t.suggestion && (
                    <p className="mt-0.5 text-fg-muted">{t.suggestion}</p>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-fg-subtle text-xs">
                      근거 질문
                    </summary>
                    <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
                      {t.evidence.map((id) => (
                        <li key={id}>
                          [{id}] {textOf.get(id)}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
