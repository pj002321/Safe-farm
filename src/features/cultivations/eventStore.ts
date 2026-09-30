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

/**
 * 조회하는 컬럼. `deleted_at` 은 where 에서만 쓰고 화면에 내리지 않는다.
 *
 * 일지 칸(`work_kind` 이하)은 **저장할 때 박아 둔 그 시점 값**이다. 읽을 때
 * 날씨를 다시 조인하지 않는다 — 관측이 나중에 정정되면 과거 일지가 소리 없이
 * 바뀐다 — 어제 보고 적은 것과 오늘 보는 것이 다르면 참고 자료로 못 쓴다.
 */
// ⚠️ 한 줄짜리 리터럴로 둔다. 이어 붙이면 supabase-js 가 select 를 타입 수준에서
//    못 읽어 결과가 `GenericStringError[]` 로 추론된다.
const EVENT_SELECT =
  "id, kind, occurred_on, body, stage_order, forecast_on, created_at, work_kind, sky_ko, task_note, advice_text, temp_max_c, temp_min_c, rainfall_mm, humidity_pct, wind_ms, wind_dir_deg, sunrise_at, sunset_at";

interface EventRow {
  id: string;
  kind: string;
  occurred_on: string;
  body: string | null;
  stage_order: number | null;
  forecast_on: string | null;
  created_at: string;
  work_kind: string | null;
  sky_ko: string | null;
  task_note: string | null;
  advice_text: string | null;
  temp_max_c: number | null;
  temp_min_c: number | null;
  rainfall_mm: number | null;
  humidity_pct: number | null;
  wind_ms: number | null;
  wind_dir_deg: number | null;
  sunrise_at: string | null;
  sunset_at: string | null;
}

const KINDS = [
  "NOTE",
  "TASK_DONE",
  "STAGE_SET",
  // 사용자가 단계표에 없는 단계를 자기 재배에만 붙인 것. 이름은 body 에 들어간다
  // (`20260920090000_cultivation_events_farm_diary.sql`).
  "STAGE_ADD",
  "FORECAST",
] as const;
type EventKind = (typeof KINDS)[number];

/** DB 가 새 kind 를 허용하게 바뀌어도 화면이 안 깨지게 좁힌다. 모르면 뺀다. */
function toKind(raw: string): EventKind | null {
  return (KINDS as readonly string[]).includes(raw) ? (raw as EventKind) : null;
}

/**
 * DB 행 → 타임라인 줄. **모르는 `kind` 는 버린다**(null).
 *
 * ⚠️ 한 건짜리 조회와 `in` 절 조회가 **같은 함수를 쓴다.** 두 벌로 적으면 칸을 하나
 *    더할 때 한쪽만 고쳐져 화면과 파일이 다른 값을 든다.
 */
function toTimelineRow(row: EventRow): TimelineEventRow | null {
  const kind = toKind(row.kind);
  if (kind === null) return null;
  return {
    id: row.id,
    kind,
    occurredOn: row.occurred_on,
    body: row.body,
    stageOrder: row.stage_order,
    forecastOn: row.forecast_on,
    createdAt: row.created_at,
    workKind: row.work_kind,
    taskNote: row.task_note,
    adviceText: row.advice_text,
    weather: {
      skyKo: row.sky_ko,
      tempMaxC: row.temp_max_c,
      tempMinC: row.temp_min_c,
      rainfallMm: row.rainfall_mm,
      humidityPct: row.humidity_pct,
      windMs: row.wind_ms,
      windDirDeg: row.wind_dir_deg,
      sunriseAt: row.sunrise_at,
      sunsetAt: row.sunset_at,
    },
  };
}

/**
 * 재배 **여러 건**의 기록을 한 번에. 재배 id → 그 재배의 줄 목록.
 *
 * ⚠️ `listCultivationEvents` 를 반복해 부르면 **N+1** 이 된다. 내보내기는 한 해치를
 *    통째로 뽑으므로 재배가 서른이면 왕복이 서른 번이다.
 * ⚠️ 기존 한 건짜리 함수를 고치지 않는다 — 재배 상세가 계속 그쪽을 쓴다.
 *
 * ⚠️ **주인 확인을 여기서 하지 않는다.** 부르는 쪽이 이미 자기 소유로 좁힌 id 만
 *    넘긴다(`app/api/me/diary-csv`). 그래도 RLS 가 `cultivations → plots` 를 타고
 *    한 번 더 거른다 — 남의 id 를 섞어 넣어도 빈 줄이 온다.
 */
export async function listEventsByCultivations(
  cultivationIds: readonly string[],
): Promise<Map<string, TimelineEventRow[]>> {
  const byId = new Map<string, TimelineEventRow[]>();
  if (cultivationIds.length === 0) return byId;

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("cultivation_events")
    // ⚠ `cultivation_id` 를 같이 받는다. 어느 재배 줄인지 갈라 담아야 한다
    .select(`cultivation_id, ${EVENT_SELECT}`)
    .in("cultivation_id", [...cultivationIds])
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false });

  if (error) throw new Error(error.message);

  for (const raw of (data ?? []) as (EventRow & { cultivation_id: string })[]) {
    const row = toTimelineRow(raw);
    if (row === null) continue;
    const bucket = byId.get(raw.cultivation_id);
    if (bucket) bucket.push(row);
    else byId.set(raw.cultivation_id, [row]);
  }
  return byId;
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
    const mapped = toTimelineRow(row);
    return mapped === null ? [] : [mapped];
  });
}

/**
 * 그날 **AI 조언이 이미 붙은** 기록이 있나.
 *
 * 리포트 글은 하루에 한 번만 박는다 — 같은 날 여러 줄에 복사되면 일지를 읽을 때
 * 같은 말을 되풀이해 읽는다. 그날 어느 한 줄에만 있으면 된다.
 *
 * ★ 2026-09-20 — 전에는 **"그날 기록이 있나"** 를 물었다(`hasEventOn`). 틀렸다 —
 *   조언이 안 붙은 기록이 하나라도 먼저 있으면 **그날은 영영 못 붙는다.**
 *   실제로 그랬다: 메모를 두 번 남겼는데 둘 다 빈 채로 남았다. 물어야 할 것은
 *   "행이 있나" 가 아니라 **"조언이 있나"** 다.
 *
 * ⚠ 종류를 가리지 않는다. `NOTE` 든 `TASK_DONE` 이든 그날 한 줄이면 충분하다.
 */
export async function hasAdviceOn(
  cultivationId: string,
  onDate: string,
): Promise<boolean> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("cultivation_events")
    .select("id")
    .eq("cultivation_id", cultivationId)
    .eq("occurred_on", onDate)
    .not("advice_text", "is", null)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export interface EventInput {
  kind: EventKind;
  occurredOn: string;
  body?: string | null;
  stageOrder?: number | null;
  forecastOn?: string | null;
  /** 농사로의 "활동유형". 물주기 · 웃거름 · 방제 · 김매기 · 수확 · 기타. */
  workKind?: string | null;
  /** 사용자가 고른 하늘. 맑음 · 흐림 · 비 · 눈. */
  skyKo?: string | null;
  /**
   * `TASK_DONE` 카드에 사용자가 적은 한 줄. 안 적으면 빈다 — **빈 것이 정상**이다.
   *
   * ⚠️ **`body` 에 이어 붙이지 말 것.** 거기엔 카드 제목만 들어가고,
   *    `domain/doneTasks.ts` 가 **그 글자로** 오늘 누른 카드를 목록에서 거른다.
   */
  taskNote?: string | null;
  /**
   * 그날 AI 리포트 글. `TASK_DONE` 중 **그날 첫 줄에만** 넣는다.
   *
   * 조인하지 않고 그때 박는 까닭은 `advices` 행이 지워져도 일지에는 남아야
   * 해서다 — 개발 중 그 표를 날짜로 통째 지운다.
   */
  adviceText?: string | null;
  /**
   * 저장 시점에 박는 그날 날씨. **없으면 넘기지 않는다.**
   *
   * ⚠️ 못 찾은 칸을 0 으로 채우지 말 것. `rainfall_mm = 0` 은 "비가 안 왔다" 는
   *    뜻이다. 못 찾은 날과 안 온 날이 같아진다.
   */
  weather?: {
    tempMaxC?: number | null;
    tempMinC?: number | null;
    rainfallMm?: number | null;
    humidityPct?: number | null;
    windMs?: number | null;
    windDirDeg?: number | null;
    sunriseAt?: string | null;
    sunsetAt?: string | null;
  } | null;
}

/** `EventInput` 하나를 DB 행으로. 한 줄짜리와 여러 줄짜리가 **같은 규칙**을 쓰게 한다. */
function toRow(cultivationId: string, input: EventInput) {
  const weather = input.weather ?? null;

  return {
    cultivation_id: cultivationId,
    kind: input.kind,
    occurred_on: input.occurredOn,
    body: input.body ?? null,
    stage_order: input.stageOrder ?? null,
    forecast_on: input.forecastOn ?? null,
    work_kind: input.workKind ?? null,
    sky_ko: input.skyKo ?? null,
    task_note: input.taskNote ?? null,
    advice_text: input.adviceText ?? null,
    temp_max_c: weather?.tempMaxC ?? null,
    temp_min_c: weather?.tempMinC ?? null,
    rainfall_mm: weather?.rainfallMm ?? null,
    humidity_pct: weather?.humidityPct ?? null,
    wind_ms: weather?.windMs ?? null,
    wind_dir_deg: weather?.windDirDeg ?? null,
    sunrise_at: weather?.sunriseAt ?? null,
    sunset_at: weather?.sunsetAt ?? null,
  };
}

/**
 * 기록 여러 줄을 **한 번에** 넣는다.
 *
 * ★ 장바구니(`했음`)가 카드마다 한 줄씩 넣는다. 줄마다 부르면 왕복이 그 수만큼
 *   늘고, 더 나쁜 것은 **중간에 실패하면 앞 줄들이 이미 들어가 있다는 것**이다.
 *   사용자는 "저장하지 못했습니다" 를 보고 다시 누르고, 그러면 앞 줄이 **두 번**
 *   저장된다. 한 번에 넣으면 전부 되거나 전부 안 된다.
 *
 * kind 별로 있어야 할 값은 `ck_cultivation_events_payload` 가 막는다. 여기서
 * 다시 검사하지 않는 이유는 검사가 두 곳에 있으면 한쪽만 고쳐지기 때문이다 —
 * 형식 검증은 그 전에 `domain/observationNote.ts` 가 한다.
 */
export async function insertCultivationEvents(
  cultivationId: string,
  inputs: readonly EventInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("cultivation_events")
    .insert(inputs.map((input) => toRow(cultivationId, input)));

  if (error) throw new Error(error.message);
}

/** 기록 한 줄. 여러 줄이면 `insertCultivationEvents` 를 쓸 것 — 왕복이 하나로 준다. */
export async function insertCultivationEvent(
  cultivationId: string,
  input: EventInput,
): Promise<void> {
  await insertCultivationEvents(cultivationId, [input]);
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
