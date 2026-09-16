/**
 * ---------------------------------------------
 * [Feature]: 텃밭 지도·카드 표시용 요약 (순수 변환)
 *
 * [Description]
 * - DB 행 → 화면이 쓰는 모양으로 좁히기만 한다. profile.ts/toProfile 과 같은 나눔.
 *   실제 조회는 plotStore.ts 가 한다.
 * - 작물과 파종일은 `plots` 가 아니라 **`cultivations`** 에서 온다. 한 밭에
 *   배추를 8월에, 무를 9월에 심을 수 있어 밭 한 행에 담기지 않는다.
 * - 재배 한 건은 `variantId` 와 `cropNameKo` 를 같이 들고 나온다. 이름은 화면에
 *   찍을 글자고, `variantId` 는 그 품종의 수확 목표 GDD(`crop_variants.gdd_target`)
 *   와 단계표(`crop_stages`)를 찾는 키다. 이름으로는 단계표를 못 찾는다 — 같은
 *   "상추"라도 숙기(`maturity_type`)가 다르면 단계가 시작되는 GDD 가 다르다.
 * - `sowing_unknown` 은 없앴다. `cultivations.sowing_date` 가 nullable 이라
 *   null 이 곧 "모름"이다 — 같은 사실을 두 컬럼으로 적으면 어긋난다.
 * ---------------------------------------------
 */

/**
 * 중첩 select 가 돌려준 값. 다대일 관계(재배 → 품종 → 작물)는 PostgREST 가
 * **객체 하나**로 주는데, DB 타입을 생성해 두지 않아 supabase-js 는 이것까지
 * 배열로 추론한다. 둘 다 받아 두고 `one()` 으로 편다 — 배열로만 읽으면 `[0]` 이
 * undefined 가 되어 작물 이름이 조용히 null 로 떨어진다.
 */
type Embedded<T> = T | T[] | null;

// 배열의 0번 인덱스 또는 값으면 값을 return
function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** 조인해 온 재배 한 건. */
export interface CultivationRow {
  variant_id: number;
  sowing_date: string | null;
  crop_variants: Embedded<{ crops: Embedded<{ name: string }> }>;
}

/** 재배 한 건을 화면이 쓰는 모양으로 좁힌 것. */
export interface CultivationSummary {
  variantId: number;
  cropNameKo: string | null;
  sowingDate: string | null;
}

// 행 하나에 crop 여러 개 일 때, 대표 crop 하나만
function toCultivationSummary(row: CultivationRow): CultivationSummary {
  return {
    variantId: row.variant_id,
    cropNameKo: one(one(row.crop_variants)?.crops)?.name ?? null,
    sowingDate: row.sowing_date,
  };
}

export interface PlotMapPoint {
  id: string;
  nameKo: string | null;
  latitude: number;
  longitude: number;
  variantId: number | null;
  cropNameKo: string | null;
  sowingDate: string | null;
}

/** plots 테이블 한 행 + 재배 목록. */
export interface PlotRow {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  cultivations: CultivationRow[];
}

export function toPlotMapPoint(row: PlotRow): PlotMapPoint {
// 마커는 한 밭에 하나뿐이라 대표 하나만 쓴다. 가장 먼저 심은 것을 대표로 본다.
const lead = leadCultivation(row.cultivations);
  return {
    id: row.id,
    nameKo: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    variantId: lead?.variant_id ?? null,
    cropNameKo: lead ? toCultivationSummary(lead).cropNameKo : null,
    sowingDate: lead?.sowing_date ?? null,
  };
}

/**
 * 목록 카드 한 장이 쓰는 값. 지도 마커(`PlotMapPoint`)보다 넓다.
 *
 * ⚠️ 이 타입은 HO-Vic 이 `e2ef705` 에서 쓴 것이다. 브랜치를 주고받는 과정의
 *    충돌 해결에서 한 번 통째로 사라졌다가(9b409c5) 되살렸다. 나는 같은 시기에
 *    거의 같은 모양의 `PlotManageItem` 을 따로 만들고 있었는데, 둘을 남기면
 *    같은 테이블을 읽는 모양이 둘이 되므로 이쪽 하나로 합쳤다.
 */
export interface PlotCard {
  id: string;
  nameKo: string | null;
  regionKo: string;
  areaM2: number | null;
  /** 이 밭에서 자라는 것 전부. 게이지를 건별로 그리려면 품종까지 필요하다. */
  cultivations: CultivationSummary[];
  sowingDate: string | null;
  createdAt: string;
}

/** 카드 목록이 읽어 오는 plots 한 행. */
export interface PlotCardRow {
  id: string;
  name: string | null;
  /** ⚠️ `numeric` 이라 supabase-js 는 **문자열로** 준다. 아래에서 숫자로 바꾼다. */
  area_m2: number | string | null;
  region_ko: string;
  created_at: string;
  cultivations: CultivationRow[];
}

export function toPlotCard(row: PlotCardRow): PlotCard {
  // `numeric` 을 문자열로 받는 건 정밀도를 지키려는 드라이버의 의도지만, 화면에서
  // `.toLocaleString()` 을 부르는 순간 문자열이라 엉뚱하게 나온다. 경계인 여기서
  // 한 번만 숫자로 바꾼다.
  const area = row.area_m2 === null ? Number.NaN : Number(row.area_m2);

  return {
    id: row.id,
    nameKo: row.name,
    regionKo: row.region_ko,
    areaM2: Number.isFinite(area) ? area : null,
    // 마커는 대표 하나만 쓰지만, 카드는 심은 것을 전부 보여준다.
    cultivations: row.cultivations.map(toCultivationSummary),
    sowingDate: leadCultivation(row.cultivations)?.sowing_date ?? null,
    createdAt: row.created_at,
  };
}

/**
 * 밭을 대표하는 재배 한 건.
 *
 * 가장 먼저 심은 것을 고른다 — 화면의 D+n 이 "이 밭을 언제부터 부쳤나"를 뜻하게
 * 하기 위해서다. 파종일을 모르는 건은 대표로 삼지 않는다(날수를 못 낸다).
 */
function leadCultivation(rows: CultivationRow[]): CultivationRow | null {
  const dated = rows.filter((row) => row.sowing_date !== null);
  if (dated.length === 0) return rows[0] ?? null;

  return dated.reduce((earliest, row) =>
    // biome-ignore lint/style/noNonNullAssertion: dated 는 sowing_date 가 있는 것만 남긴다.
    row.sowing_date! < earliest.sowing_date! ? row : earliest,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 심은 날부터 지난 날수(D+n). 모르면 null. */
export function daysSincePlanting(
  point: Pick<PlotMapPoint, "sowingDate">,
  now: Date,
): number | null {
  if (!point.sowingDate) return null;
  const diffMs = now.getTime() - new Date(point.sowingDate).getTime();
  return Math.floor(diffMs / DAY_MS);
}
