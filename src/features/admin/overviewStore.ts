import "server-only";

import { getSupabaseAdmin } from "@/shared/supabase/server";
import { kstDateString } from "@/shared/utils/kstDate";
import { type CropShare, cropShare } from "./domain/cropShare";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 개요 지표 (V1-100)
 *
 * [Description]
 * - 전 사용자 합계라 **RLS 를 우회하는 `getSupabaseAdmin()`** 으로 센다. 그래서
 *   `server-only` 이고, 부르는 화면이 먼저 `requireAdminOrRedirect()` 를 거쳐야 한다.
 * - 숫자는 `head: true` 로 개수만 받는다. 행을 내려받아 세면 사용자가 늘수록 느려진다.
 * - 밭·재배는 소프트 삭제라 `deleted_at is null` 을 **반드시** 건다. 빠뜨리면
 *   지운 밭까지 활성으로 센다.
 * - "오늘" 은 한국 자정 기준이다. 할 일 카드도 00:00 KST 에 만들어진다.
 * ---------------------------------------------
 */

export interface AdminOverview {
  members: number;
  activePlots: number;
  growing: number;
  topCrops: CropShare[];
  tasksToday: { total: number; done: number };
  asksLast7Days: number;
}

type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function countOf(result: {
  count: number | null;
  error: { message: string } | null;
}) {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export async function getAdminOverview(
  now = new Date(),
): Promise<AdminOverview> {
  const db = getSupabaseAdmin();
  const todayStart = new Date(`${kstDateString(now)}T00:00:00+09:00`);
  const weekAgo = new Date(todayStart.getTime() - 6 * 86_400_000);
  const head = { count: "exact", head: true } as const;

  const [members, plots, growing, tasks, tasksDone, asks, growingCrops] =
    await Promise.all([
      db.from("profiles").select("id", head),
      db.from("plots").select("id", head).is("deleted_at", null),
      db
        .from("cultivations")
        .select("id", head)
        .eq("status", "GROWING")
        .is("deleted_at", null),
      db
        .from("plot_tasks")
        .select("id", head)
        .gte("generated_at", todayStart.toISOString()),
      db
        .from("plot_tasks")
        .select("id", head)
        .gte("generated_at", todayStart.toISOString())
        .eq("done", true),
      db
        .from("ask_history")
        .select("id", head)
        .gte("created_at", weekAgo.toISOString()),
      db
        .from("cultivations")
        .select("crop_variants(crops(name))")
        .eq("status", "GROWING")
        .is("deleted_at", null),
    ]);

  if (growingCrops.error) throw new Error(growingCrops.error.message);
  const rows = growingCrops.data as unknown as {
    crop_variants: Embedded<{ crops: Embedded<{ name: string | null }> }>;
  }[];

  return {
    members: countOf(members),
    activePlots: countOf(plots),
    growing: countOf(growing),
    topCrops: cropShare(
      rows.map((row) => one(one(row.crop_variants)?.crops)?.name ?? null),
      5,
    ),
    tasksToday: { total: countOf(tasks), done: countOf(tasksDone) },
    asksLast7Days: countOf(asks),
  };
}
