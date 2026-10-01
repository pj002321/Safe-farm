"use server";

import { aiService } from "@/shared/aiService/client";
import { requireAdmin } from "@/shared/auth/adminSession";

export async function loadWeeklyBriefing() {
  await requireAdmin();
  return aiService.weeklyBriefing();
}
