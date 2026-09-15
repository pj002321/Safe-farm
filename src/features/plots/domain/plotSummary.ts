/**
 * ---------------------------------------------
 * [Feature]: 텃밭 지도 표시용 요약 (순수 변환)
 *
 * [Description]
 * - DB 행 → 화면이 쓰는 모양으로 좁히기만 한다. profile.ts/toProfile 과 같은 나눔.
 *   실제 조회는 plotStore.ts 가 한다.
 * ---------------------------------------------
 */

export interface PlotMapPoint {
  id: string;
  nameKo: string | null;
  latitude: number;
  longitude: number;
  cropId: string | null;
  sowingDate: string | null;
  sowingUnknown: boolean;
}

/** plots 테이블 한 행. */
export interface PlotRow {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  crops: string[];
  sowing_date: string | null;
  sowing_unknown: boolean;
}

export function toPlotMapPoint(row: PlotRow): PlotMapPoint {
  return {
    id: row.id,
    nameKo: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    cropId: row.crops[0] ?? null,
    sowingDate: row.sowing_date,
    sowingUnknown: row.sowing_unknown,
  };
}

/**
 * 마이페이지 텃밭 관리 목록의 한 줄.
 *
 * `PlotMapPoint` 를 넓혀 쓰지 않는다. 그쪽은 **지도 전용**이라 주소·면적을 일부러
 * 버린 모양이고, 여기에 맞춰 넓히면 지도 화면이 그리지도 않는 주소 문자열을 매번
 * 실어 나르게 된다. 같은 테이블이라도 화면이 다르면 모양도 다른 편이 정직하다.
 */
export interface PlotManageItem {
  id: string;
  nameKo: string | null;
  addressKo: string;
  /** ㎡. 등록할 때 건너뛸 수 있는 값이라 없을 수 있다. */
  areaM2: number | null;
  crops: readonly string[];
  sowingDate: string | null;
  sowingUnknown: boolean;
  createdAt: string;
}

/** 관리 목록이 읽는 컬럼. `PlotRow` 와 겹치지만 select 목록이 달라 따로 둔다. */
export interface PlotManageRow {
  id: string;
  name: string | null;
  address_ko: string;
  area_m2: number | string | null;
  crops: string[];
  sowing_date: string | null;
  sowing_unknown: boolean;
  created_at: string;
}

/**
 * DB 행 → 관리 목록 모양.
 *
 * `area_m2` 가 `numeric` 이라 supabase-js 는 **문자열로** 준다. 정밀도를 잃지
 * 않으려는 드라이버의 의도지만, 화면에서 `.toFixed()` 를 부르는 순간 터진다.
 * 경계인 여기서 한 번만 숫자로 바꾼다.
 */
export function toPlotManageItem(row: PlotManageRow): PlotManageItem {
  const area = row.area_m2 === null ? Number.NaN : Number(row.area_m2);

  return {
    id: row.id,
    nameKo: row.name,
    addressKo: row.address_ko,
    areaM2: Number.isFinite(area) ? area : null,
    crops: row.crops,
    sowingDate: row.sowing_date,
    sowingUnknown: row.sowing_unknown,
    createdAt: row.created_at,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 심은 날부터 지난 날수(D+n). 모르면 null. */
export function daysSincePlanting(
  point: Pick<PlotMapPoint, "sowingDate" | "sowingUnknown">,
  now: Date,
): number | null {
  if (point.sowingUnknown || !point.sowingDate) return null;
  const diffMs = now.getTime() - new Date(point.sowingDate).getTime();
  return Math.floor(diffMs / DAY_MS);
}
