import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import {
  carryOverStart,
  kstDayStart,
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
 * - 조회가 **둘로 나뉜다.** 홈은 지금 해야 할 일만, 이전 기록은 나머지 전부다.
 *   경계 계산은 전부 `domain/taskSummary.ts` 의 순수 함수가 한다(테스트가 그쪽에
 *   붙어 있다) — 여기서는 그 값을 질의에 넣기만 한다.
 * ---------------------------------------------
 */

const CARD_COLUMNS =
  "id, title, reason, priority, done, done_at, generated_at, plots!inner(name, user_id)";

/**
 * 홈에 보여 줄 카드. **"지금 해야 할 일"**이다.
 *
 *   · 미완료 — 최근 CARRY_OVER_DAYS 일 이내 생성분
 *   · 완료   — 오늘(KST) 체크한 것
 *
 * 미완료를 이월하는 이유: 어제 만들어졌는데 아직 미완료인 카드는 **오늘 다시
 * 만들어지지 않는다**(생성 쪽이 같은 제목의 미완료 카드를 건너뛴다). "오늘
 * 생성분"만 거르면 어제 물을 안 준 밭이 화면에서 통째로 사라진다.
 *
 * 완료분을 `done_at` 으로 거르는 이유: 사흘 전 카드를 방금 체크했으면 그건
 * 오늘 한 일이다. `generated_at` 으로 거르면 방금 누른 것이 화면에서 사라져,
 * 체크가 먹었는지 알 수 없다.
 */
export async function listTaskCards(
  userId: string,
  now: Date = new Date(),
): Promise<TaskCardData[]> {
  const supabase = await getSupabaseServer();

  const carryStart = carryOverStart(now).toISOString();
  const dayStart = kstDayStart(now).toISOString();

  const { data, error } = await supabase
    .from("plot_tasks")
    .select(CARD_COLUMNS)
    // RLS 가 자기 밭의 카드만 보이게 하지만, plotStore.ts 처럼 where 도 명시한다.
    .eq("plots.user_id", userId)
    .or(
      `and(done.is.false,generated_at.gte.${carryStart}),` +
        `and(done.is.true,done_at.gte.${dayStart})`,
    )
    .order("generated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return sortByPriority(
    (data ?? []).map((row) => toTaskCard(row as unknown as TaskRow, now)),
  );
}

/**
 * 이전 기록. 홈에서 빠진 나머지 — 이월 기간을 넘긴 미완료와, 오늘 이전에 끝낸 것.
 *
 * `listTaskCards` 의 정확한 여집합이라 두 화면 사이로 새는 카드가 없다.
 * (`done=true` 인데 `done_at` 이 비어 있는 행은 나올 수 없다 — 완료를 쓰는 곳은
 * `setTaskDone` 하나뿐이고 둘을 함께 쓴다. 컬럼 범위 GRANT 가 그걸 강제한다.)
 *
 * 최신순으로만 준다. 이전 기록은 "언제 뭘 했나"를 되짚는 화면이라 우선순위가
 * 아니라 시간이 축이다.
 */
export async function listTaskHistory(
  userId: string,
  now: Date = new Date(),
  limit = 100,
): Promise<TaskCardData[]> {
  const supabase = await getSupabaseServer();

  const carryStart = carryOverStart(now).toISOString();
  const dayStart = kstDayStart(now).toISOString();

  const { data, error } = await supabase
    .from("plot_tasks")
    .select(CARD_COLUMNS)
    .eq("plots.user_id", userId)
    .or(
      `and(done.is.false,generated_at.lt.${carryStart}),` +
        `and(done.is.true,done_at.lt.${dayStart})`,
    )
    .order("generated_at", { ascending: false })
    // 페이지네이션 없이 다 불러오면 오래 쓴 계정에서 화면이 멈춘다.
    // ponytail: 더 보기가 필요해지면 그때 커서를 붙인다.
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toTaskCard(row as unknown as TaskRow, now));
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
