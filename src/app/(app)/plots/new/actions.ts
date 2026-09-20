"use server";

import { redirect } from "next/navigation";
import { resolveVariantIds } from "@/features/crops/cropStore";
import { insertCultivations } from "@/features/cultivations/cultivationStore";
import {
  parseCultivationSelections,
  toCultivationInputs,
} from "@/features/cultivations/domain/parseCultivationSelection";
import { toKmaGrid } from "@/features/monitoring/domain/kmaGrid";
import {
  PLOT_LOCATION_MESSAGE,
  validatePlotLocation,
} from "@/features/monitoring/domain/plotLocation";
import { parsePlotRegistration } from "@/features/plots/domain/registerPlot";
import { insertPlot } from "@/features/plots/plotStore";
import { aiService, type RecommendResult } from "@/shared/aiService/client";
import { requireUser } from "@/shared/auth/session";
import { kstDateString } from "@/shared/utils/kstDate";
/**
 * ---------------------------------------------
 * [Feature]: 텃밭 등록 제출
 *
 * [Description]
 * - ⚠️ `'use server'` 파일의 export 하나가 곧 공개 POST 엔드포인트다. 그래서
 *   `requireUser()` 를 첫 줄에서 부른다 — 마법사 화면 자체에는 로그인 검사가
 *   없다(레이아웃의 검사는 액션에 미치지 않는다, AGENTS.md).
 * - `page.tsx` 의 `<form>` 은 JS 가 0바이트다. `action={registerPlot}` 을
 *   그대로 달면 Next 가 폼 제출을 이 함수 호출로 바꿔 준다 — 브라우저 JS 없이도
 *   동작한다(progressive enhancement).
 * - 격자 계산은 여기서 한다. `features/plots` 는 `features/monitoring` 을
 *   import 할 수 없지만(features 끼리 금지), 이 파일은 `app` 계층이라
 *   양쪽을 다 불러도 된다. 밭 → 품종 → 재배로 세 feature 를 엮는 것도 같은
 *   이유로 여기서 한다.
 * - 밭과 재배는 두 번의 insert 다. Supabase 클라이언트에는 트랜잭션이 없어서,
 *   뒤가 실패하면 작물 없는 밭이 남는다 — 밭 상세에서 작물을 더할 수 있게
 *   만들면 복구되는 상태라 지금은 그대로 둔다.
 *
 * [Usage]
 * ```tsx
 * <form action={registerPlot}>...</form>
 * ```
 * ---------------------------------------------
 */
/**
 * 3단계(작물 선택)에서 좌표만으로 "지금 심기 좋은 작물" 을 미리 본다(V1-51).
 * 폼 제출이 아니라 화면이 버튼으로 직접 부르는 액션이라 값을 그대로 돌려준다.
 *
 * 실패·후보 없음·좌표 미선택은 전부 null 로 뭉갠다 — 그때 화면은 패널을
 * 숨긴다(ai-service `api/recommend.py` 와 같은 원칙).
 */
export async function recommendCrops(
  lat: number,
  lon: number,
): Promise<RecommendResult | null> {
  await requireUser();

  if (validatePlotLocation({ lat, lon })) return null;

  const result = await aiService.recommend(lat, lon);
  return result.ok ? result.data : null;
}

export async function registerPlot(formData: FormData): Promise<void> {
  const viewer = await requireUser();

  const parsed = parsePlotRegistration(formData);
  if (!parsed.ok) throw new Error(parsed.error);

  // 지도 단계의 검사는 클라이언트일 뿐이다. 이 액션은 공개 POST 엔드포인트라
  // 폼을 거치지 않고 직접 호출될 수 있으므로 국내 좌표인지 여기서 다시 막는다.
  const locationIssue = validatePlotLocation({
    lat: parsed.value.latitude,
    lon: parsed.value.longitude,
  });
  if (locationIssue) throw new Error(PLOT_LOCATION_MESSAGE[locationIssue]);

  const grid = toKmaGrid({
    lat: parsed.value.latitude,
    lon: parsed.value.longitude,
  });

  const plotId = await insertPlot(viewer.id, parsed.value, {
    gridX: grid.nx,
    gridY: grid.ny,
  });

  // 폼은 작물까지만 고른다. 재배 행은 품종을 가리키므로 여기서 한 번 바꿔 준다.
  // 작물마다 파종일·방식이 다를 수 있어(배추 8월, 무 9월) 폼도 작물별로 받는다.
  const selections = parseCultivationSelections(formData);
  // 숙기를 고른 작물만 담는다. 안 고른 작물은 resolveVariantIds 가 중생 우선으로 정한다
  const maturityByCropId = new Map(
    selections.flatMap((s) =>
      s.maturity ? [[s.cropId, s.maturity] as const] : [],
    ),
  );
  const variantIdByCropId = await resolveVariantIds(
    selections.map((selection) => selection.cropId),
    maturityByCropId,
  );

  await insertCultivations(
    plotId,
    toCultivationInputs(selections, variantIdByCropId, kstDateString()),
  );

  // 자정 배치를 기다리지 않고 등록 직후 오늘 할 일을 채운다. ai-service 가
  // 죽어 있어도 밭 등록 자체는 끝난 상태라 리다이렉트를 막지 않는다.
  const generated = await aiService.generateTasks(plotId);
  if (!generated.ok) {
    console.error(
      "[registerPlot] 할 일 카드 생성 실패",
      generated.reason,
      generated.detail,
    );
  }

  redirect("/dashboard");
}
