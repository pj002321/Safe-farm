/**
 * ---------------------------------------------
 * [Feature]: 지난 재배 기록 — 타입과 연도별 묶기 (순수)
 *
 * [Description]
 * - 끝난 재배 사이클 한 건이 한 행이다. "다음 시즌에 뭘 언제 심었더라"를 되짚는
 *   자료라 **끝난 것만** 담는다. 진행 중인 재배는 대시보드가 맡는다.
 * - 조회는 `plotStore.ts` 의 `listCultivationRecords()` 가 한다. `cultivations`
 *   는 features/cultivations 소관이지만 여기서 직접 읽는다 — 이 도메인 타입
 *   자체가 밭 이름을 들고 있어, 따로 빼면 features 끼리 import 하게 된다
 *   (AGENTS.md 금지, `softDeletePlot` 과 같은 방침).
 * - `yieldKg`·`noteKo` 는 지금 DB 에 자리가 없다(수확량·메모 컬럼 없음) — 항상
 *   `null` 이다. 그 컬럼이 생기면 `toCultivationRecord()` 만 고치면 된다.
 * - 날짜는 `Date` 가 아니라 ISO 문자열이다. 서버 → 클라이언트 경계에서 Date 는
 *   어차피 문자열이 되므로 타입이 거짓말하지 않게 처음부터 문자열로 맞춘다
 *   (`profile.ts` 와 같은 방침).
 *
 * [Usage]
 * ```ts
 * const years = groupByYear(records);
 * years[0].year;          // 2026 — 최신이 먼저
 * years[0].records;       // 그 해 기록, 파종일 늦은 순
 * ```
 * ---------------------------------------------
 */

export interface CultivationRecord {
  id: string;
  /** 어느 밭이었나. 밭이 지워져도 기록은 남으므로 id 가 아니라 이름을 박아 둔다. */
  plotKo: string;
  cropKo: string;
  /** 파종·정식일 (ISO `YYYY-MM-DD`). */
  sowingDate: string;
  /** 수확일 (ISO `YYYY-MM-DD`). 끝난 기록만 담으므로 반드시 있다. */
  harvestDate: string;
  /** 수확량(kg). 안 적은 해가 있어서 없을 수 있다. */
  yieldKg: number | null;
  /** 한 줄 메모. 다음 시즌에 참고할 내용. */
  noteKo: string | null;
}

/** 한 해치 묶음. */
export interface RecordYear {
  year: number;
  records: readonly CultivationRecord[];
  /** 그 해 수확량 합계(kg). 적어 둔 것이 하나도 없으면 null. */
  totalYieldKg: number | null;
}

/** PostgREST 중첩 select 는 다대일도 배열로 추론될 때가 있다(plotSummary.ts 참고). */
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** `listCultivationRecords()` 가 조인해 온 재배 한 행. */
export interface CultivationRecordRow {
  id: string;
  sowing_date: string | null;
  harvested_at: string | null;
  plots: Embedded<{ name: string | null }>;
  crop_variants: Embedded<{ crops: Embedded<{ name: string | null }> }>;
}

/**
 * DB 행 → `CultivationRecord`. 파종일을 모르는 재배(모종으로 시작해
 * `start_stage_order` 만 있는 경우)는 재배 기간을 낼 수 없어 `null` 로 걸러진다
 * — 호출부가 `filter` 로 뺀다.
 */
export function toCultivationRecord(
  row: CultivationRecordRow,
): CultivationRecord | null {
  if (!row.sowing_date || !row.harvested_at) return null;

  const crop = one(one(row.crop_variants)?.crops);

  return {
    id: row.id,
    plotKo: one(row.plots)?.name ?? "이름 없는 밭",
    cropKo: crop?.name ?? "이름 없는 작물",
    sowingDate: row.sowing_date,
    harvestDate: row.harvested_at,
    yieldKg: null,
    noteKo: null,
  };
}

/**
 * 연도를 **수확일에서** 뽑는다.
 *
 * 파종일이 아니라 수확일인 이유: 가을에 심어 이듬해 봄에 거두는 작물(마늘·양파)이
 * 있어서 파종 연도로 묶으면 "2025년 기록"에 2026년 수확이 섞인다. 사용자가 이
 * 화면을 보는 목적은 "그 해에 무엇을 거뒀나"이므로 수확 연도가 맞다.
 *
 * 문자열 앞 네 글자를 쓰는 것은 `new Date()` 의 시간대 함정을 피하기 위해서다 —
 * `new Date("2026-01-01").getFullYear()` 는 한국 시간대에서 2026 이지만 UTC-5
 * 환경에서는 2025 가 된다. 서버와 브라우저가 다른 답을 내면 안 된다.
 */
export function yearOf(record: CultivationRecord): number {
  return Number(record.harvestDate.slice(0, 4));
}

/** 적어 둔 수확량의 합. 하나도 없으면 null(0 과 구별해야 한다 — 0kg 흉작과 미기록은 다르다). */
function sumYield(records: readonly CultivationRecord[]): number | null {
  const known = records.filter((r) => r.yieldKg !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, r) => sum + (r.yieldKg ?? 0), 0);
}

/**
 * 연도별로 묶는다. 최신 해가 먼저, 각 해 안에서는 수확일 늦은 순.
 *
 * 입력을 건드리지 않는다(`toSorted` 가 아니라 복사 후 정렬해도 되지만, 읽는 쪽이
 * 원본 순서에 기대지 않도록 여기서 순서를 확정한다).
 */
export function groupByYear(
  records: readonly CultivationRecord[],
): readonly RecordYear[] {
  const buckets = new Map<number, CultivationRecord[]>();

  for (const record of records) {
    const year = yearOf(record);
    const bucket = buckets.get(year);
    if (bucket) bucket.push(record);
    else buckets.set(year, [record]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => {
      const sorted = [...rows].sort((a, b) =>
        b.harvestDate.localeCompare(a.harvestDate),
      );
      return { year, records: sorted, totalYieldKg: sumYield(sorted) };
    });
}

/** 고른 해의 기록만. `null` 이면 전체. */
export function filterByYear(
  records: readonly CultivationRecord[],
  year: number | null,
): readonly CultivationRecord[] {
  if (year === null) return records;
  return records.filter((record) => yearOf(record) === year);
}

/**
 * 재배 기간(일).
 *
 * 달력 날짜끼리의 차이라 UTC 자정으로 고정해서 뺀다. 지역 시간대로 파싱하면
 * 서머타임이 있는 지역에서 하루가 23시간이 되어 결과가 어긋난다.
 */
export function cultivationDays(record: CultivationRecord): number {
  const from = Date.parse(`${record.sowingDate}T00:00:00Z`);
  const to = Date.parse(`${record.harvestDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}
