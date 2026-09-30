"use server";

import { requireAdmin } from "@/shared/auth/adminSession";
import { aiService } from "@/shared/aiService/client";

export async function analyzeQuestionTrends() {
  await requireAdmin();
  return aiService.questionTrends();
}

export async function embedMissingChunks() {
  await requireAdmin();
  return aiService.embedMissing();
}

export async function runRetrievalEval() {
  await requireAdmin();
  return aiService.retrievalEval();
}
