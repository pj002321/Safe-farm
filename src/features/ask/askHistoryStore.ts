import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: 질문 기록 저장 (서버 전용)
 *
 * [Description]
 * - `getSupabaseServer()` 를 쓴다 — 로그인한 사용자 권한 그대로 조회하므로
 *   `ask_history_select_own` RLS 정책이 그대로 걸린다(`taskStore.ts` 와 같은 방침).
 * - 쓰기는 여기서 하지 않는다. ai-service(`app/service/ask_history.py`)가 질문마다
 *   행을 남기고, 여기는 `/me`가 그걸 읽기만 한다.
 * - `answer` 가 비어 있으면 `message`(가드레일 차단·근거 없음 안내)로 대신 채운다 —
 *   AskPanel(`AskAnswer.tsx`)이 화면에서 하는 것과 같은 규칙이다.
 */

export interface AskHistoryEntry {
  id: string;
  question: string;
  /** 실제 답변이 없으면(가드레일 차단·한도 초과 등) 안내 문구로 대신 채운다. */
  answerKo: string;
  rating: "up" | "down" | null;
  createdAt: string;
}

export async function listAskHistory(
  userId: string,
  limit = 50,
): Promise<AskHistoryEntry[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("ask_history")
    .select("id, question, answer, message, rating, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    // ponytail: 더 보기가 필요해지면 그때 커서를 붙인다(taskStore.listTaskHistory와 같은 자리).
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    question: row.question,
    answerKo: row.answer ?? row.message ?? "",
    rating: row.rating as "up" | "down" | null,
    createdAt: row.created_at,
  }));
}
