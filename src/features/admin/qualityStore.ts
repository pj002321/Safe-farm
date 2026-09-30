import "server-only"
import { getSupabaseAdmin } from "@/shared/supabase/server";
import { kstDateString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: AI 답변 품질 · 가드레일 로그 (V1-114 · V1-116)
 *
 * [Description]
 * - 전 사용자 이력이라 **RLS 를 우회하는 `getSupabaseAdmin()`** 으로 읽는다.
 *   부르는 화면이 먼저 `requireAdminOrRedirect()` 를 거쳐야 한다.
 * - 가드레일 차단은 `message` 가 차단 문구로 시작하는 행이다. 문구 정본은
 *   ai-service `app/domain/guardrail.py` 의 BLOCKED_MESSAGE — 그쪽 첫머리를 바꾸면
 *   여기 `BLOCKED_PREFIX` 도 같이 바꾼다.
 * - `feedback_reason` 은 자유 입력이라 개인정보가 섞일 수 있다. 관리자 화면에서만
 *   보이고 사용자 화면으로 되돌려 주지 않는다.
 * ---------------------------------------------
 */

const BLOCKED_PREFIX = "농약 희석배수";
const RECENT_LIMIT = 20;

export interface AskRow {
    id: string;
    question: string;
    answer: string | null;
    feedbackReason: string | null;
    createdAt: string;
}

export interface AskQuality {
    total: number;
    up: number;
    down: number;
    blocked: number;
    recentDown: AskRow[];
    recentBlocked: AskRow[];
}

function countOf(result: {
    count: number | null;
    error: { message: string} | null;
}) {
    if(result.error) throw new Error(result.error.message);
    return result.count ?? 0;
}

function rowsOf(result: {
    data:
    | {
        id: string;
        question: string;
        answer: string | null;
        feedback_reason: string | null;
        created_at: string;
    }[]
    |null;
    error: {message:string} | null;
}): AskRow[] {
    if(result.error) throw new Error(result.error.message);
    return (result.data ?? []).map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        feedbackReason: row.feedback_reason,
        createdAt: row.created_at,
    }));
}

export async function getAskQuality(now = new Date()): Promise<AskQuality> {
  const db = getSupabaseAdmin();
  const todayStart = new Date(`${kstDateString(now)}T00:00:00+09:00`);
  const since = new Date(todayStart.getTime() - 6 * 86_400_000).toISOString();
  const head = { count: "exact", head: true } as const;
  const columns = "id, question, answer, feedback_reason, created_at";
  const recent = () =>
    db
      .from("ask_history")
      .select(columns)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);

  const [total, up, down, blocked, recentDown, recentBlocked] =
    await Promise.all([
      db.from("ask_history").select("id", head).gte("created_at", since),
      db
        .from("ask_history")
        .select("id", head)
        .gte("created_at", since)
        .eq("rating", "up"),
      db
        .from("ask_history")
        .select("id", head)
        .gte("created_at", since)
        .eq("rating", "down"),
      db
        .from("ask_history")
        .select("id", head)
        .gte("created_at", since)
        .like("message", `${BLOCKED_PREFIX}%`),
      recent().eq("rating", "down"),
      recent().like("message", `${BLOCKED_PREFIX}%`),
    ]);

  return {
    total: countOf(total),
    up: countOf(up),
    down: countOf(down),
    blocked: countOf(blocked),
    recentDown: rowsOf(recentDown),
    recentBlocked: rowsOf(recentBlocked),
  };
}