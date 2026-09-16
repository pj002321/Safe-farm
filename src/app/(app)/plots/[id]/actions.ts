"use server";

import { redirect } from "next/navigation";
import { markHarvested } from "@/features/cultivations/cultivationStore";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 상세 — 재배 관리 Server Actions
 *
 * [Description]
 * - export 하나가 곧 공개 POST 엔드포인트다(AGENTS.md) — 첫 줄에서
 *   `requireConsent()` 를 부른다.
 * ---------------------------------------------
 */

/** 사용자에게 보여줄 문장만 쿼리에 싣고 그 상세 화면으로 돌려보낸다. */
function fail(plotId: string, message: string): never {
  redirect(`/plots/${plotId}?error=${encodeURIComponent(message)}`);
}

/** 재배 한 건을 수확 완료로 표시한다. */
export async function harvestCultivation(formData: FormData): Promise<void> {
  await requireConsent();

  const plotId = String(formData.get("plotId") ?? "");
  const cultivationId = String(formData.get("cultivationId") ?? "");
  if (!plotId || !cultivationId) redirect("/plots");

  try {
    await markHarvested(cultivationId);
  } catch {
    fail(
      plotId,
      "수확 처리를 하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.",
    );
  }

  redirect(`/plots/${plotId}?saved=harvested`);
}
