"use server";

import { requireAdmin } from "@/shared/auth/adminSession";
import { aiService } from "@/shared/aiService/client";

export async function analyzeMember(userId: string) {
  await requireAdmin();
  return aiService.memberInsight(userId);
}
