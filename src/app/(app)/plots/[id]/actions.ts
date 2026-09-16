"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteCultivation,
  markHarvested,
} from "@/features/cultivations/cultivationStore";
import { getPlotDetail } from "@/features/plots/plotStore";
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

/**
 * 수확 완료로 표시한다.
 *
 * 수확일은 서버가 한국 날짜로 정한다. 폼에서 받지 않는 이유는 이 버튼이 "오늘
 * 거뒀다"는 뜻이어서다 — 지난 날짜로 적어야 하는 경우가 생기면 그때 입력을 받되,
 * 파종일보다 이른 날짜를 막는 검사가 같이 필요하다.
 */
export async function harvestCultivation(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const { plotId, cultivationId } = readIds(formData);
  if (!plotId || !cultivationId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) fail(plotId, "밭을 찾지 못했습니다.");

  try {
    await markHarvested(plotId, cultivationId, kstDateString());
  } catch {
    fail(plotId, "수확 기록에 실패했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(`/plots/${plotId}`);
  redirect(`/plots/${plotId}?saved=harvested`);
}

/**
 * 재배 한 건을 지운다. 되돌릴 수 없다.
 *
 * 수확한 것을 치우는 길이 아니다 — 그건 `harvestCultivation` 이 상태로 남긴다.
 * 이쪽은 잘못 등록한 건을 정정한다(`cultivationStore.deleteCultivation` 주석).
 */
export async function removeCultivation(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const { plotId, cultivationId } = readIds(formData);
  if (!plotId || !cultivationId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) fail(plotId, "밭을 찾지 못했습니다.");

  try {
    await deleteCultivation(plotId, cultivationId);
  } catch {
    fail(plotId, "삭제하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(`/plots/${plotId}`);
  redirect(`/plots/${plotId}?saved=deleted`);
}
