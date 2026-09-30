"use server";

import { requireAdmin } from "@/shared/auth/adminSession";
import { aiService } from "@/shared/aiService/client";

export async function analyzeQuestionTrends() {
  await requireAdmin();
  return aiService.questionTrends();
}
