import "server-only";

import { getSupabaseAdmin } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: 그날 AI 리포트 글 읽기 (서버 전용)
 *
 * [Description]
 * - `했음` 을 누른 기록에 **그날 리포트를 텍스트로 같이 박기 위해서만** 쓴다.
 *   리포트가 지워져도 그날 일지에는 남아야 한다 — 실제로 개발 중
 *   `delete from advices where advice_date = current_date` 를 돌린다.
 *
 * ⚠️ **`getSupabaseAdmin()` 은 RLS 를 우회한다.** `advices` 는 잠금만 켜고 정책을
 *    하나도 안 둔 표라(`20260918000000_advices.sql`) 일반 클라이언트로는 0행이
 *    나온다. 그 잠금을 푸는 대신 우회 열쇠로 읽는다 — 정책을 열면 브라우저 쪽
 *    세계가 이 표를 보게 되고, 그건 이 한 기능이 요구하는 것보다 훨씬 넓다.
 *
 * ⚠️ **그래서 소유 확인을 이 파일이 하지 않는다. 부르는 쪽이 한다.**
 *    우회 열쇠는 "남의 재배인가" 를 봐주지 않는다. `actions.ts` 가
 *    `getPlotDetail(viewer.id, plotId)` 로 밭 주인을 먼저 확인한 뒤에만 부른다.
 *
 * ⚠️ **없으면 만들지 않는다.** ai-service 의 `/v1/reports/{plot_id}` 는 캐시가
 *    없으면 LLM 을 불러 새로 만든다. 여기서 그 길을 쓰면 `했음` 을 누를 때마다
 *    리포트가 생성되고 토큰이 나간다 — 교안이 말한 "리포트를 **출력할 경우**" 와
 *    반대다. 이 파일은 **있는 것만 읽고 없으면 null** 이다.
 * ---------------------------------------------
 */

/** 목록 칸 하나를 글자 배열로. 빈 것·글자 아닌 것은 버린다. */
function lines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((one) => (typeof one === "string" ? one.trim() : ""))
    .filter((one) => one.length > 0);
}

/**
 * 그 재배의 그날 리포트 **전체**. 아직 안 만들어졌으면 null.
 *
 * ★ 2026-09-20 — 전에는 `summary` 한 줄만 담았다. 리포트 탭은 그 아래에 할 일과
 *   주의를 불릿으로 더 보여 주는데, 일지에는 첫 줄만 남아 **화면에서 본 것과
 *   달랐다.** 보고 옮겨 적는 것이 이 일지의 쓸모라 모양이 같아야 한다.
 *
 * ⚠ **`todos` 와 `warnings` 를 나누지 않는다.** 리포트 탭이 둘을 같은 불릿으로
 *   보여 주기 때문이다(`components/report/…`). 여기서만 나누면 화면과 달라진다.
 *
 * 조회가 실패해도 던지지 않는다 — 이 값이 없다고 기록 자체가 막히면 안 된다.
 */
export async function adviceSummaryOn(
  cultivationId: string,
  onDate: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("advices")
    .select("summary, todos, warnings")
    .eq("cultivation_id", cultivationId)
    .eq("advice_date", onDate)
    .maybeSingle();

  if (error) {
    console.error("[cultivation] 그날 리포트 조회 실패", error.message);
    return null;
  }
  if (!data) return null;

  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  const bullets = [...lines(data.todos), ...lines(data.warnings)];

  // 요약도 불릿도 없으면 담지 않는다. 빈 글자를 담으면 화면이 "리포트가 있다" 고
  // 읽어 아래 안내(까닭)를 못 내보낸다.
  if (summary.length === 0 && bullets.length === 0) return null;

  return [summary, ...bullets.map((one) => `- ${one}`)]
    .filter((one) => one.length > 0)
    .join("\n");
}
