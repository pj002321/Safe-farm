"use server";

import { requireAdmin } from "@/shared/auth/adminSession";
import { aiService } from "@/shared/aiService/client";

export async function diagnoseBatches() {
  await requireAdmin();
  return aiService.diagnoseBatches();
}
