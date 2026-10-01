"use server";

import { aiService } from "@/shared/aiService/client";
import { listAccounts } from "@/shared/auth/accounts";
import { requireAdmin } from "@/shared/auth/adminSession";

export async function loadAtRiskReport() {
  await requireAdmin();
  const [result, accounts] = await Promise.all([
    aiService.atRiskMembers(),
    listAccounts(),
  ]);
  if (!result.ok) return result;
  const emailOf = new Map(accounts.map((a) => [a.id, a.email]));
  return {
    ok: true as const,
    data: {
      ...result.data,
      members: result.data.members.map((m) => ({
        ...m,
        email: emailOf.get(m.userId) ?? null,
      })),
    },
  };
}
