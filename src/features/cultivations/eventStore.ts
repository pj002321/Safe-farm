import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import type { TimelineEventRow } from "./domain/timeline";

/**
 * ---------------------------------------------
 * [Feature]: 재배 기록(cultivation_events) 저장 (서버 전용)
 *
 * [Description]
 * - 메모·작업 완료·단계 보정·예측을 한 표에 담는다. 파종·수확·중단은 **여기
 *   없다** — `cultivations` 의 컬럼이고, 타임라인은 읽을 때 둘을 합친다
 *   (`domain/timeline.ts`).
 * - 소유 확인을 이 파일이 하지 않는다. RLS 가 `cultivations → plots` 를 타고
 *   건다(`20260917110000_cultivation_events.sql`). 남의 재배 id 를 넣으면 조회는
 *   빈 배열, insert 는 정책 위반으로 실패한다.
 * - 사진은 받지 않는다. 업로드는 AI 사진 분석과 한 묶음이라 그 브랜치로 미뤘다
 *   (`20260917140000_cultivation_events_drop_photo.sql`).
 * ---------------------------------------------
 */

/** 조회하는 컬럼. `deleted_at` 은 where 에서만 쓰고 화면에 내리지 않는다. */
const EVENT_SELECT = "id, kind, occurred_on, body, stage_order, forecast_on";

interface EventRow {
  id: string;
  kind: string;
  occurred_on: string;
  body: string | null;
  stage_order: number | null;
  forecast_on: string | null;
}

const KINDS = ["NOTE", "TASK_DONE", "STAGE_SET", "FORECAST"] as const;
type EventKind = (typeof KINDS)[number];

/** DB 가 새 kind 를 허용하게 바뀌어도 화면이 안 깨지게 좁힌다. 모르면 뺀다. */
function toKind(raw: string): EventKind | null {
  return (KINDS as readonly string[]).includes(raw) ? (raw as EventKind) : null;
}

/**
 * 재배 한 건의 기록 전부. 최신순 정렬은 `buildTimeline` 이 다시 한다.
 *
 * 여기서 정렬을 맞춰 두는 이유는 건수가 많아졌을 때 인덱스
 * (`cultivation_events_timeline_idx`) 를 그대로 타기 위해서다.
 */
export async function listCultivationEvents(
  cultivationId: string,
): Promise<TimelineEventRow[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivation_events")
    .select(EVENT_SELECT)
    .eq("cultivation_id", cultivationId)
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as EventRow[]).flatMap((row) => {
    const kind = toKind(row.kind);
    if (kind === null) return [];
    return [
      {
        id: row.id,
        kind,
        occurredOn: row.occurred_on,
        body: row.body,
        stageOrder: row.stage_order,
        forecastOn: row.forecast_on,
      },
    ];
  });
}

export interface EventInput {
  kind: EventKind;
  occurredOn: string;
  body?: string | null;
  stageOrder?: number | null;
  forecastOn?: string | null;
}

/**
 * 기록 한 줄을 넣는다.
 *
 * kind 별로 있어야 할 값은 `ck_cultivation_events_payload` 가 막는다. 여기서
 * 다시 검사하지 않는 이유는 검사가 두 곳에 있으면 한쪽만 고쳐지기 때문이다 —
 * 형식 검증은 그 전에 `domain/observationNote.ts` 가 한다.
 */
export async function insertCultivationEvent(
  cultivationId: string,
  input: EventInput,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { error } = await supabase.from("cultivation_events").insert({
    cultivation_id: cultivationId,
    kind: input.kind,
    occurred_on: input.occurredOn,
    body: input.body ?? null,
    stage_order: input.stageOrder ?? null,
    forecast_on: input.forecastOn ?? null,
  });

  if (error) throw new Error(error.message);
}

/**
 * 기록 한 줄을 숨긴다. 행은 남는다(plots·cultivations 와 같은 방침).
 *
 * 0건이면 던진다 — update 는 대상이 없어도 오류가 아니라 0건으로 끝난다.
 */
export async function softDeleteCultivationEvent(
  cultivationId: string,
  eventId: string,
): Promise<void> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivation_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("cultivation_id", cultivationId)
    // 두 번 지우면 시각이 덮어써져 "언제 지웠나"가 틀어진다.
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("EVENT_NOT_FOUND");
}
