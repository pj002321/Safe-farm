/**
 * ---------------------------------------------
 * [Feature]: 밭 상세의 작물 카드 (순수 변환)
 *
 * [Description]
 * - `cultivations` 한 행 → 카드 한 장이 쓰는 모양. 조회는 `cultivationStore.ts`
 *   가 하고 여기서는 좁히기만 한다(`plotSummary.ts` 와 같은 나눔).
 * - 게이지 분모(`crop_variants.gdd_target`)와 기준온도(`crops.base_temp`)를 같이
 *   들고 나온다. 이름만으로는 게이지를 못 그린다 — 같은 "상추"라도 숙기가 다르면
 *   목표 GDD 가 다르다.
 * - ⚠️ `numeric` 컬럼(`base_temp`·`upper_temp`)은 supabase-js 가 **문자열로**
 *   준다. 경계인 여기서 한 번만 숫자로 바꾼다. 그대로 계산에 넣으면
 *   `"5.0" - 3` 같은 식이 조용히 섞인다.
 * ---------------------------------------------
 */

/** PostgREST 중첩 select 는 다대일도 배열로 추론될 때가 있다(plotSummary.ts 참고). */
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** `numeric` 문자열을 숫자로. 못 읽으면 null. */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type CultivationStatus = "PLANNED" | "GROWING" | "HARVESTED" | "FAILED";

/** 조회해 온 재배 한 행. */
export interface CultivationCardRow {
  id: string;
  variant_id: number;
  alias: string | null;
  status: string;
  sowing_date: string | null;
  sowing_type: string;
  start_stage_order: number | null;
  harvested_at: string | null;
  created_at: string;
  crop_variants: Embedded<{
    maturity_type: string;
    gdd_target: number;
    days_to_harvest: number | null;
    crops: Embedded<{
      name: string;
      base_temp: number | string;
      upper_temp: number | string | null;
    }>;
  }>;
}

export interface CultivationCard {
  id: string;
  variantId: number;
  /** 사용자가 붙인 이름. 없으면 화면이 작물 이름으로 대신한다. */
  aliasKo: string | null;
  cropNameKo: string | null;
  /** 조생·중생·만생. 같은 작물이 여러 건일 때 카드를 구별하는 단서다. */
  maturityType: string | null;
  status: CultivationStatus;
  sowingDate: string | null;
  sowingType: "SEED" | "SEEDLING";
  startStageOrder: number | null;
  harvestedAt: string | null;
  /** 수확까지 쌓아야 할 누적 GDD. 게이지 분모. */
  gddTarget: number | null;
  daysToHarvest: number | null;
  baseTempC: number | null;
  upperTempC: number | null;
  createdAt: string;
}

/** 체크 제약이 막아 주지만, DB 가 새 값을 허용하게 바뀌어도 화면이 안 깨지게 좁힌다. */
function toStatus(raw: string): CultivationStatus {
  return raw === "PLANNED" || raw === "HARVESTED" || raw === "FAILED"
    ? raw
    : "GROWING";
}

export function toCultivationCard(row: CultivationCardRow): CultivationCard {
  const variant = one(row.crop_variants);
  const crop = one(variant?.crops);

  return {
    id: row.id,
    variantId: row.variant_id,
    aliasKo: row.alias,
    cropNameKo: crop?.name ?? null,
    maturityType: variant?.maturity_type ?? null,
    status: toStatus(row.status),
    sowingDate: row.sowing_date,
    sowingType: row.sowing_type === "SEEDLING" ? "SEEDLING" : "SEED",
    startStageOrder: row.start_stage_order,
    harvestedAt: row.harvested_at,
    gddTarget: variant?.gdd_target ?? null,
    daysToHarvest: variant?.days_to_harvest ?? null,
    baseTempC: num(crop?.base_temp),
    upperTempC: num(crop?.upper_temp),
    createdAt: row.created_at,
  };
}

/**
 * 카드에 찍을 이름.
 *
 * 별칭이 우선이다 — 같은 작물을 두 군데 심었을 때 사용자가 구별하려고 붙인
 * 이름이라 그게 더 정확하다. 둘 다 없으면 화면이 빈칸 대신 쓸 말을 준다.
 */
export function cardTitle(card: CultivationCard): string {
  return card.aliasKo ?? card.cropNameKo ?? "이름 없는 작물";
}

/**
 * 진행 중인 것이 위로, 그 안에서는 먼저 심은 것이 위로.
 *
 * 수확·실패한 건을 아래로 내리는 이유는 "지금 뭘 해야 하나"가 이 화면의 목적이라
 * 끝난 작물이 위에 있으면 답을 흐리기 때문이다. 파종일을 모르는 건은 등록 순으로
 * 뒤에 붙인다.
 */
const STATUS_RANK: Record<CultivationStatus, number> = {
  GROWING: 0,
  PLANNED: 1,
  HARVESTED: 2,
  FAILED: 3,
};

export function sortCultivationCards(
  cards: readonly CultivationCard[],
): CultivationCard[] {
  return [...cards].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    if (a.sowingDate && b.sowingDate) {
      return a.sowingDate.localeCompare(b.sowingDate);
    }
    if (a.sowingDate) return -1;
    if (b.sowingDate) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
