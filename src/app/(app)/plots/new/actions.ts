"use server";

import { redirect } from "next/navigation";
import { toKmaGrid } from "@/features/monitoring/domain/kmaGrid";
import { parsePlotRegistration } from "@/features/plots/domain/registerPlot";
import { insertPlot } from "@/features/plots/plotStore";
import { requireUser } from "@/shared/auth/session";
import {
  PLOT_LOCATION_MESSAGE,
  validatePlotLocation,
} from "@/features/monitoring/domain/plotLocation";
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
 *   양쪽을 다 불러도 된다.
 *
 * [Usage]
 * ```tsx
 * <form action={registerPlot}>...</form>
 * ```
 * ---------------------------------------------
 */
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

  await insertPlot(viewer.id, parsed.value, { gridX: grid.nx, gridY: grid.ny });

  redirect("/dashboard");
}
