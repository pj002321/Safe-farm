"use server";

import { requireAdmin } from "@/shared/auth/adminSession";
import { aiService, type RerunJob } from "@/shared/aiService/client";

const JOBS: readonly RerunJob[] = ["tasks", "alerts", "weather"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function diagnoseBatches() {
  await requireAdmin();
  return aiService.diagnoseBatches();
}

export async function rerunBatch(job: string, dateFrom: string, dateTo: string) {
  await requireAdmin();
  // 액션은 공개 POST 엔드포인트다. 화면의 select 가 막아 줘도 값은 여기서 다시 본다.
  if (!JOBS.includes(job as RerunJob)) return { started: false as const, error: "모르는 작업입니다." };
  const period = job === "weather";
  if (period && !(DATE.test(dateFrom) && DATE.test(dateTo))) {
    return { started: false as const, error: "시작일과 종료일을 넣어 주세요." };
  }
  const result = await aiService.rerunBatch(
    job as RerunJob,
    period ? dateFrom : null,
    period ? dateTo : null,
  );
  return result.ok
    ? result.data
    : { started: false as const, error: result.detail ?? result.reason };
}
