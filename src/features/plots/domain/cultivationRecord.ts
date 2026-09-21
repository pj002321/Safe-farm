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
 * - `yieldKg` 는 `cultivations.yield_kg` 에서 온다. 재배를 끝낼 때 적는 값이라
 *   **기르는 중이거나 안 적었으면 비어 있고**, 그것이 정상이다 — 화면의 `— kg` 과
 *   연도별 합계의 `기록 없음` 이 그 경우다.
 *   ⚠️ 한 줄 메모(`noteKo`)는 **지웠다**. DB 에 자리가 없어 늘 `null` 이었고,
 *      쓰는 곳도 화면 한 줄뿐이라 CSV 에 빈 칸만 내보내고 있었다(2026-09-22).
 * - 날짜는 `Date` 가 아니라 ISO 문자열이다. 서버 → 클라이언트 경계에서 Date 는
 *   어차피 문자열이 되므로 타입이 거짓말하지 않게 처음부터 문자열로 맞춘다
 *   (`profile.ts` 와 같은 방침).
 *
 * [Usage]
 * ```ts
 * const years = groupByYear(records);
 * years[0].year;          // 2026 — 최신이 먼저
 * years[0].records;       // 그 해 기록, 끝난 날 늦은 순
 * ```
 * ---------------------------------------------
 */

export interface CultivationRecord {
  id: string;
  /**
   * 밭 상세(아카이브)로 가는 링크에 **쓸** id. 교안 8-3 에서 화면이 붙인다.
   *
   * 보이는 줄은 전부 **살아 있는 밭**이다 — 밭을 지우면 `softDeletePlot` 이 그 밭의
   * 재배도 같이 `deleted_at` 을 찍어 여기서 걸러진다(2026-09-22 실측 0건).
   */
  plotId: string;
  /**
   * 어느 밭이었나.
   *
   * 끝낸 시점에 박아 둔 이름(`plot_name_at_end`)이고, 비어 있으면 지금 이름
   * (`plots.name` 조인값)이다. 밭 이름을 고쳐도 지난 기록은 옛 이름을 지킨다.
   */
  plotKo: string;
  cropKo: string;
  /** 단계 이름표를 붙일 때 **쓸** 품종 id. 교안 8-6 에서 일지 줄이 붙인다. */
  variantId: number;
  /** 파종·정식일 (ISO `YYYY-MM-DD`). */
  sowingDate: string;
  /**
   * 끝난 날 (ISO `YYYY-MM-DD`). 수확이면 `harvested_at`, 중단이면 `failed_at`.
   *
   * ⚠️ 이름이 `harvestDate` 였는데 바꿨다. 실패한 재배도 담게 되면서 "수확일"이
   *    거짓말이 됐다 — 실패에는 수확일이 없다.
   */
  endDate: string;
  /**
   * 어떻게 끝났나. 화면의 `실패` 배지가 **쓸** 값 — 교안 8-3 에서 붙인다.
   *
   * ⚠️ `endDate` 가 두 날짜를 하나로 합쳐 버려서 **되짚을 수 없다.** 그래서
   *    유도하지 않고 칸으로 든다.
   */
  endKind: "HARVESTED" | "FAILED";
  /** 수확량(kg). 안 적은 해가 있어서 없을 수 있다. */
  yieldKg: number | null;
}

/** 한 해치 묶음. */
export interface RecordYear {
  year: number;
  records: readonly CultivationRecord[];
  /** 그 해 수확량 합계(kg). 적어 둔 것이 하나도 없으면 null. */
  totalYieldKg: number | null;
}

/**
 * PostgREST 중첩 select 는 다대일도 배열로 추론될 때가 있다(plotSummary.ts 참고).
 *
 * ⚠️ **내보내기 조회(`listCultivationsForExport`)도 이것을 쓴다.** 조인 모양이
 *    같은데 거기서 다시 적었다가 같은 파일 안에 사본이 늘었다 — 그래서 여기서
 *    내보낸다(2026-09-22). 저장소에 이미 세 벌이 있으니 네 번째를 만들지 말 것.
 */
export type Embedded<T> = T | T[] | null;

export function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** `listCultivationRecords()` 가 조인해 온 재배 한 행. */
export interface CultivationRecordRow {
  id: string;
  variant_id: number;
  sowing_date: string | null;
  harvested_at: string | null;
  /** 중단한 날. `status` 가 `FAILED` 일 때만 채워진다. */
  failed_at: string | null;
  /** ⚠️ `numeric` 이라 supabase-js 는 **문자열로** 준다(`PlotDetailRow.area_m2` 와 같다). */
  yield_kg: number | string | null;
  /** 끝낼 때 박아 둔 밭 이름. 그 전에 끝난 건은 마이그레이션이 채웠고, 비면 조인값으로 떨어진다. */
  plot_name_at_end: string | null;
  plots: Embedded<{ id: string; name: string | null }>;
  crop_variants: Embedded<{ crops: Embedded<{ name: string | null }> }>;
}

/**
 * `numeric` 으로 온 수확량을 숫자로. 빈 것과 못 읽는 값은 `null`(0 이 아니다).
 *
 * 내보내기 조회(`listCultivationsForExport`)도 같은 컬럼을 읽으므로 같이 쓴다 —
 * 거기서 `number` 라고만 적어 두면 문자열이 그대로 흘러 타입이 거짓말을 한다.
 */
export function toYieldKg(raw: number | string | null): number | null {
  if (raw === null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * DB 행 → `CultivationRecord`. 파종일을 모르는 재배(모종으로 시작해
 * `start_stage_order` 만 있는 경우)는 재배 기간을 낼 수 없어 `null` 로 걸러진다
 * — 호출부가 `filter` 로 뺀다.
 *
 * ⚠️ **끝난 날이 두 칸에 나뉘어 있다.** 수확은 `harvested_at`, 중단은 `failed_at`.
 *    둘 다 비어 있으면 아직 안 끝난 것이므로 기록이 아니다.
 */
export function toCultivationRecord(
  row: CultivationRecordRow,
): CultivationRecord | null {
  const endDate = row.harvested_at ?? row.failed_at;
  const plot = one(row.plots);
  // 밭 id 가 없으면 기록이 아니다. `plots!inner` 라 실제로는 안 걸리지만, 빈
  // 문자열로 떨어뜨리면 `/plots//cultivations/…` 라는 깨진 링크가 조용히 만들어진다
  if (!row.sowing_date || !endDate || !plot?.id) return null;

  const crop = one(one(row.crop_variants)?.crops);

  return {
    id: row.id,
    plotId: plot.id,
    // 박아 둔 이름이 먼저다. 조인값(`plots.name`)은 **지금** 이름이라, 밭 이름을
    // 고치면 지난 기록까지 따라 바뀐다. CSV(`listCultivationsForExport`)도 같은
    // 순서로 읽는다 — 목록과 파일이 다른 밭 이름을 말하면 안 된다.
    plotKo: row.plot_name_at_end ?? plot.name ?? "이름 없는 밭",
    cropKo: crop?.name ?? "이름 없는 작물",
    variantId: row.variant_id,
    sowingDate: row.sowing_date,
    endDate,
    // 수확일이 있으면 수확으로 본다.
    //
    // ⚠️ **둘 다 찍힌 행이 있을 수 있다.** `ck_cultivations_failed_at` 은
    //    `status='FAILED'` 와 `failed_at` 만 묶고 `harvested_at` 은 안 본다.
    //    `markFailed` 에는 `markHarvested` 가 가진 `.eq("status","GROWING")`
    //    가드도 없어서, 탭 둘로 겹쳐 누르면 둘 다 찍힌다.
    //    같은 상황의 판단이 `harvestSummary.ts` 에 이미 있고 **거기와 같은 쪽**을
    //    고른다 — *"중단했다가 조금이라도 거뒀다면 사용자에게는 거둔 쪽이 사실"*.
    endKind: row.harvested_at ? "HARVESTED" : "FAILED",
    // ⚠️ `Number(null)` 은 0 이다. 안 적은 것을 `0kg 흉작` 으로 바꾸지 않도록
    //    null 을 먼저 가른다. 숫자로 안 읽히는 값도 0 이 아니라 null 이다.
    yieldKg: toYieldKg(row.yield_kg),
  };
}

/**
 * 연도를 **끝난 날에서** 뽑는다.
 *
 * 파종일이 아니라 끝난 날인 이유: 가을에 심어 이듬해 봄에 거두는 작물(마늘·양파)이
 * 있어서 파종 연도로 묶으면 "2025년 기록"에 2026년 수확이 섞인다. 사용자가 이
 * 화면을 보는 목적은 "그 해에 무엇을 거뒀나"이므로 끝난 해가 맞다.
 *
 * ⚠️ 중단한 재배도 같은 규칙을 탄다 — 그때 `endDate` 는 `failed_at` 이다.
 *
 * 문자열 앞 네 글자를 쓰는 것은 `new Date()` 의 시간대 함정을 피하기 위해서다 —
 * `new Date("2026-01-01").getFullYear()` 는 한국 시간대에서 2026 이지만 UTC-5
 * 환경에서는 2025 가 된다. 서버와 브라우저가 다른 답을 내면 안 된다.
 */
export function yearOf(record: CultivationRecord): number {
  return Number(record.endDate.slice(0, 4));
}

/** 적어 둔 수확량의 합. 하나도 없으면 null(0 과 구별해야 한다 — 0kg 흉작과 미기록은 다르다). */
function sumYield(records: readonly CultivationRecord[]): number | null {
  const known = records.filter((r) => r.yieldKg !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, r) => sum + (r.yieldKg ?? 0), 0);
}

/**
 * 연도별로 묶는다. 최신 해가 먼저, 각 해 안에서는 끝난 날 늦은 순.
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
        b.endDate.localeCompare(a.endDate),
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
  const to = Date.parse(`${record.endDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}
