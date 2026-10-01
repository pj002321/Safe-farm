"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rerunBatch } from "@/app/(admin)/admin/batches/actions";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { RerunState } from "@/shared/aiService/client";

const JOB_LABEL = {
  tasks: "오늘 할 일 생성",
  alerts: "기상특보 적재",
  weather: "기상 관측 재적재 (기간 지정)",
} as const;

const field =
  "rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg";

export function RerunPanel({ state }: { state: RerunState }) {
  const router = useRouter();
  const [job, setJob] = useState<keyof typeof JOB_LABEL>("weather");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) =>
    startTransition(async () => {
      const result = await rerunBatch(
        job,
        String(formData.get("from") ?? ""),
        String(formData.get("to") ?? ""),
      );
      setMessage(
        result.started
          ? "시작했습니다. 새로 고치면 진행 상태가 보입니다."
          : result.error,
      );
      router.refresh();
    });

  return (
    <Card title="수동 재실행">
      <form action={submit} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-fg-muted text-xs">작업</span>
          <select
            className={field}
            onChange={(e) => setJob(e.target.value as keyof typeof JOB_LABEL)}
            value={job}
          >
            {Object.entries(JOB_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {job === "weather" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-fg-muted text-xs">시작일</span>
              <input className={field} name="from" required type="date" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-fg-muted text-xs">종료일 (최대 31일)</span>
              <input className={field} name="to" required type="date" />
            </label>
          </>
        )}
        <Button
          disabled={state.running}
          loading={pending}
          size="sm"
          type="submit"
          variant="secondary"
        >
          실행
        </Button>
      </form>
      {message && <p className="mt-2 text-fg-muted text-sm">{message}</p>}
      {state.job && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted text-xs">마지막 재실행</span>
          <span>{JOB_LABEL[state.job]}</span>
          <Badge
            size="sm"
            tone={
              state.running
                ? "info"
                : state.result?.startsWith("실패")
                  ? "unsuitable"
                  : "good"
            }
          >
            {state.running ? "진행 중" : "끝남"}
          </Badge>
          {state.result && (
            <span className="text-fg-muted">{state.result}</span>
          )}
        </p>
      )}
      <p className="mt-2 text-fg-subtle text-xs">
        백그라운드로 돌고, 한 번에 하나만 실행됩니다. ai-service 가 재시작되면
        진행 상태가 사라집니다.
      </p>
    </Card>
  );
}
