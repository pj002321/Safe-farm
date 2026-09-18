"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveVariantIds } from "@/features/crops/cropStore";
import {
  insertCultivations,
  markHarvested,
  softDeleteCultivation,
  updateCultivationSowing,
} from "@/features/cultivations/cultivationStore";
import {
  parseCultivationSelections,
  toCultivationInputs,
} from "@/features/cultivations/domain/parseCultivationSelection";
import { getPlotDetail } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";
import { kstDateString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: 밭 상세의 재배 관리 Server Actions
 *
 * [Description]
 * - ⚠️ **export 하나가 곧 공개 POST 엔드포인트**다(AGENTS.md). `/plots/actions.ts`
 *   와 같은 규칙을 그대로 따른다 — 헬퍼는 export 하지 않고, 액션마다 **첫 줄에서**
 *   `requireConsent()` 를 부른다. 페이지의 검사는 액션에 미치지 않는다.
 * - 소유 확인을 `getPlot()` 으로 **한 번 더** 한다. `cultivations` 의 RLS 는
 *   `plots` 를 경유하므로 남의 밭 재배는 어차피 0건으로 끝나지만, 그러면 "없는
 *   행"과 "남의 행"이 같은 실패로 뭉개진다. 밭부터 확인하면 액션이 어느 밭을
 *   만지는지가 코드에 남는다.
 * - 실패 메시지에 DB 오류 원문을 싣지 않는다. 테이블·컬럼 이름이 섞여 나온다.
 * - export 하나가 곧 공개 POST 엔드포인트다(AGENTS.md) — 첫 줄에서
 *   `requireConsent()` 를 부른다.
 * ---------------------------------------------
 */

/** 사용자에게 보여줄 문장만 쿼리에 싣고 그 밭으로 돌려보낸다. */

function fail(plotId: string, message: string): never {
  redirect(`/plots/${plotId}?error=${encodeURIComponent(message)}`);
}

/** 폼에서 온 두 id 를 좁힌다. 하나라도 비면 아무 일도 하지 않는다. */
function readIds(formData: FormData): {
  plotId: string;
  cultivationId: string;
} {
  const plotRaw = formData.get("plotId");
  const cultivationRaw = formData.get("cultivationId");
  return {
    plotId: typeof plotRaw === "string" ? plotRaw.trim() : "",
    cultivationId:
      typeof cultivationRaw === "string" ? cultivationRaw.trim() : "",
  };
}

/** 재배 한 건을 수확 완료로 표시한다. */
export async function harvestCultivation(formData: FormData): Promise<void> {
  await requireConsent();

  const plotId = String(formData.get("plotId") ?? "");
  const cultivationId = String(formData.get("cultivationId") ?? "");
  if (!plotId || !cultivationId) redirect("/plots");

  try {
    await markHarvested(plotId, cultivationId, kstDateString());
  } catch {
    fail(
      plotId,
      "수확 처리를 하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.",
    );
  }

  redirect(`/plots/${plotId}?saved=harvested`);
}

/**
 * 재배 한 건을 지운다.
 *
 * 화면에서는 삭제지만 DB 에는 `deleted_at` 이 찍힌다(`softDeleteCultivation`).
 * 되살리는 길이 화면에 없으므로 사용자에게는 삭제라고 말한다.
 *
 * 수확한 것을 치우는 길이 아니다 — 그건 `harvestCultivation` 이 상태로 남긴다.
 * 이쪽은 잘못 등록한 건을 정정한다.
 */
export async function removeCultivation(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const { plotId, cultivationId } = readIds(formData);
  if (!plotId || !cultivationId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) fail(plotId, "밭을 찾지 못했습니다.");

  try {
    await softDeleteCultivation(plotId, cultivationId);
  } catch {
    fail(plotId, "삭제하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(`/plots/${plotId}`);
  redirect(`/plots/${plotId}?saved=deleted`);
}

/**
 * 이미 있는 밭에 작물을 더 심는다.
 *
 * 등록 폼(`plots/new/actions.ts`)의 품종 조회·저장 로직을 그대로 재사용한다 —
 * 두 화면이 같은 `CropCards` 마크업과 `parseCultivationSelections` 를 쓴다.
 *
 * `plotId` 는 폼에서 온 값이라 그대로 믿지 않는다. 이 액션은 export 하나가 곧
 * 공개 POST 라 상세 화면을 거치지 않고도 부를 수 있다. `getPlotDetail` 이
 * `user_id` 와 `deleted_at is null` 을 같이 보므로 남의 밭과 지운 밭이 한 번에
 * 걸러진다 — `cultivations_insert_own` 도 `api/tasks.py` 도 지운 밭을 안 본다.
 */
export async function addCultivations(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const plotId = String(formData.get("plotId") ?? "");
  if (!plotId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) fail(plotId, "밭을 찾지 못했습니다.");

  const selections = parseCultivationSelections(formData);
  const variantIdByCropId = await resolveVariantIds(
    selections.map((selection) => selection.cropId),
  );

  try {
    await insertCultivations(
      plotId,
      toCultivationInputs(selections, variantIdByCropId, kstDateString()),
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
 *
 * 오늘보다 뒤의 날짜는 `GROWING` 이 아니라 `PLANNED` 로 넣는다 — 아직 심지
 * 않았는데 "자라는 중"이 되는 것을 막는다. 폼은 `max` 로 달력을 오늘에서
 * 끊지만(`CultivationList`) 이 액션 자체가 공개 POST 라 여기서 다시 본다.
 * `toCultivationInputs` 와 같은 판정이다.
 */
export async function editCultivationSowing(formData: FormData): Promise<void> {
  await requireConsent();

  const plotId = String(formData.get("plotId") ?? "");
  const cultivationId = String(formData.get("cultivationId") ?? "");
  if (!plotId || !cultivationId) redirect("/plots");

  const known = formData.get("sowingStatus") === "known";
  const sowingDate = String(formData.get("sowingDate") ?? "").trim() || null;
  // 심을 예정일로 남기되 상태만 PLANNED 로 둠. 날짜를 지우면 "미정"과 구별이 안 된다.
  const future = sowingDate !== null && sowingDate > kstDateString();

  try {
    await updateCultivationSowing(cultivationId, {
      status: known && sowingDate && !future ? "GROWING" : "PLANNED",
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
