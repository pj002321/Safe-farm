"use server";

import { redirect } from "next/navigation";
import { parsePlotEdit } from "@/features/plots/domain/editPlot";
import { softDeletePlot, updatePlotBasics } from "@/features/plots/plotStore";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 관리 Server Actions
 *
 * [Description]
 * - ⚠️ **export 하나가 곧 공개 POST 엔드포인트**다(AGENTS.md). 그래서
 *     · 헬퍼를 export 하지 않는다(`fail` 에 export 가 없다).
 *     · 액션마다 **첫 줄에서** `requireConsent()` 를 부른다. 페이지·레이아웃의
 *       검사는 액션에 미치지 않는다 — 누구든 이 URL 로 바로 POST 할 수 있다.
 * - 실패 메시지를 쿼리에 싣되 원문을 그대로 싣지 않는다. DB 오류 문구에는
 *   테이블·컬럼 이름이 섞여 나온다(제18조).
 * ---------------------------------------------
 */

/** 사용자에게 보여줄 문장만 쿼리에 싣고 그 화면으로 돌려보낸다. */
function fail(message: string): never {
  redirect(`/plots?error=${encodeURIComponent(message)}`);
}

/** 텃밭 이름·넓이 수정. 위치는 여기서 바꾸지 않는다(editPlot.ts 주석 참고). */
export async function updatePlot(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const parsed = parsePlotEdit(formData);
  if (!parsed.ok) fail(parsed.error);

  try {
    await updatePlotBasics(viewer.id, parsed.value);
  } catch {
    // 남의 밭 id 를 보냈거나 이미 지워진 경우도 여기로 온다. 어느 쪽인지
    // 알려주지 않는다 — 남의 밭이 "있다"는 사실 자체가 정보다.
    fail("수정하지 못했습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.");
  }

  redirect("/plots?saved=1");
}

/**
 * 텃밭 삭제.
 *
 * 화면에서는 삭제지만 DB 에서는 `deleted_at` 이 찍힐 뿐이다(`softDeletePlot`).
 * 사용자에게 "되돌릴 수 있다"고 말하지는 않는다 — 되살리는 길이 화면에 없다.
 *
 * `plotId` 는 겨냥 라디오(`name="plotId"`)에서 온다. 아무것도 겨냥하지 않았으면
 * 빈 문자열이라 아무 일도 하지 않고 돌아간다 — 빈 값으로 보내면 실패 메시지만
 * 띄우게 되는데, 사용자는 취소한 것이지 실패한 게 아니다.
 */
export async function removePlot(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const raw = formData.get("plotId");
  const plotId = typeof raw === "string" ? raw.trim() : "";
  if (!plotId) redirect("/plots");

  try {
    await softDeletePlot(viewer.id, plotId);
  } catch {
    fail("삭제하지 못했습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.");
  }

  redirect("/plots?saved=deleted");
}
