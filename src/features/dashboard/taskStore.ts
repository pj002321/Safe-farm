import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import {
  sortByPriority,
  type TaskCardData,
  type TaskRow,
  toTaskCard,
} from "./domain/taskSummary";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 할 일 카드 저장 (서버 전용)
 *
 * [Description]
 * - `getSupabaseServer()` 를 쓴다 — 로그인한 사용자 권한 그대로 조회·수정하므로
 *   `plot_tasks_select_own`/`plot_tasks_update_own` RLS 정책이 그대로 걸린다
 *   (`plotStore.ts` 와 같은 방침).
 * - 카드 생성(판정)은 여기서 하지 않는다. ai-service(`app/service/plot_tasks.py`)
 *   가 만든 행을 읽고, 완료 체크만 여기서 쓴다.
 * ---------------------------------------------
 */

const CARD_COLUMNS =
  "id, title, reason, priority, done, done_at, plots!inner(name, user_id)";

/** 로그인한 사용자의 모든 밭에 걸린 할 일 카드. 급한 순서로 정렬해 돌려준다. */
export async function listTaskCards(userId: string): Promise<TaskCardData[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plot_tasks")
    .select(CARD_COLUMNS)
    // RLS 가 자기 밭의 카드만 보이게 하지만, plotStore.ts 처럼 where 도 명시한다.
    .eq("plots.user_id", userId)
    .order("generated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return sortByPriority(
    (data ?? []).map((row) => toTaskCard(row as unknown as TaskRow)),
  );
}

/**
 * 완료 체크 토글.
 *
 * 컬럼 범위 GRANT(`done`, `done_at`)와 RLS 가 같이 막아 주므로 남의 카드 id 를
 * 보내면 0건으로 끝난다 — `updatePlotBasics` 와 같은 이유로 그 경우 던진다.
 */
export async function setTaskDone(
  taskId: string,
  done: boolean,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("plot_tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("TASK_NOT_FOUND");
}
