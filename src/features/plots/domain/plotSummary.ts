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

/** 목록 카드 한 장이 쓰는 값. 지도 마커(PlotMapPoint)보다 넓다. */
export interface PlotCard {
  id: string;
  nameKo: string | null;
  regionKo: string;
  areaM2: number | null;
  cropIds: string[];
  sowingDate: string | null;
  sowingUnknown: boolean;
  createdAt: string;
}

/** 카드 목록이 읽어 오는 plots 한 행. */
export interface PlotCardRow {
  id: string;
  name: string | null;
  area_m2: number | null;
  region_ko: string;
  crops: string[];
  sowing_date: string | null;
  sowing_unknown: boolean;
  created_at: string;
}

export function toPlotCard(row: PlotCardRow): PlotCard {
  return {
    id: row.id,
    nameKo: row.name,
    regionKo: row.region_ko,
    areaM2: row.area_m2,
    // 마커는 대표 작물 하나만 쓰지만, 카드는 심은 작물을 전부 보여준다.
    cropIds: row.crops,
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