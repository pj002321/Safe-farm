"use server";

import { redirect } from "next/navigation";
import { resolveVariantIds } from "@/features/crops/cropStore";
import {
  insertCultivations,
  markHarvested,
  updateCultivationSowing,
} from "@/features/cultivations/cultivationStore";
import {
  parseCultivationSelections,
  toCultivationInputs,
} from "@/features/cultivations/domain/parseCultivationSelection";
import { aiService } from "@/shared/aiService/client";
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

/**
 * 이미 있는 밭에 작물을 더 심는다.
 *
 * 등록 폼(`plots/new/actions.ts`)의 품종 조회·저장 로직을 그대로 재사용한다 —
 * 두 화면이 같은 `CropCards` 마크업과 `parseCultivationSelections` 를 쓴다.
 */
export async function addCultivations(formData: FormData): Promise<void> {
  await requireConsent();

  const plotId = String(formData.get("plotId") ?? "");
  if (!plotId) redirect("/plots");

  const selections = parseCultivationSelections(formData);
  const variantIdByCropId = await resolveVariantIds(
    selections.map((selection) => selection.cropId),
  );

  try {
    await insertCultivations(
      plotId,
      toCultivationInputs(selections, variantIdByCropId),
    );
  } catch {
    fail(
      plotId,
      "작물을 추가하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.",
    );
  }

  // 새 재배가 생겼으니 자정 배치 전에 오늘 할 일도 다시 판정한다. 실패해도
  // 재배 저장 자체는 끝났으니 화면 이동은 막지 않는다.
  const generated = await aiService.generateTasks(plotId);
  if (!generated.ok) {
    console.error(
      "[addCultivations] 할 일 카드 생성 실패",
      generated.reason,
      generated.detail,
    );
  }

  redirect(`/plots/${plotId}?saved=cultivation`);
}

/**
 * 이미 심은 재배 한 건의 파종일을 고친다.
 *
 * 등록·작물 추가 때는 값을 한 번만 받고 고칠 방법이 없었다 — 파종일이 GDD
 * 적산의 기준점이라 잘못 적으면 생육 단계·오늘 할 일 판정이 계속 어긋난다.
 */
export async function editCultivationSowing(formData: FormData): Promise<void> {
  await requireConsent();

  const plotId = String(formData.get("plotId") ?? "");
  const cultivationId = String(formData.get("cultivationId") ?? "");
  if (!plotId || !cultivationId) redirect("/plots");

  const known = formData.get("sowingStatus") === "known";
  const sowingDate = String(formData.get("sowingDate") ?? "").trim() || null;

  try {
    await updateCultivationSowing(cultivationId, {
      status: known && sowingDate ? "GROWING" : "PLANNED",
      sowingDate: known ? sowingDate : null,
    });
  } catch {
    fail(
      plotId,
      "파종일을 저장하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.",
    );
  }

  redirect(`/plots/${plotId}?saved=sowing`);
}
