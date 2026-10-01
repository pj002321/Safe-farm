"use server";

import { aiService } from "@/shared/aiService/client";
import { requireAdmin } from "@/shared/auth/adminSession";

export async function analyzeMember(userId: string) {
  await requireAdmin();
  return aiService.memberInsight(userId);
}
