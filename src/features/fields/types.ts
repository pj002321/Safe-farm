/**
 * ---------------------------------------------
 * [Feature]: 농지(field) 도메인 타입
 *
 * [Description]
 * - 타입은 `actions.ts` 가 아니라 여기 둔다. `'use server'` 파일에 두면
 *   그 파일의 export 표면이 커져 헷갈린다.
 * - DB 행(Row)과 화면에 내보내는 DTO를 구분한다. 서버가 가진 걸 그대로
 *   내보내면 나중에 컬럼 하나 추가할 때 조용히 유출된다.
 * ---------------------------------------------
 */

/** DB `fields` 테이블 한 행. 서버 내부에서만 쓴다. */
export interface FieldRow {
  id: string;
  owner_id: string;
  name: string;
  area_m2: number;
  latitude: number;
  longitude: number;
  created_at: string;
}

/** 클라이언트로 내보내는 형태. owner_id 같은 내부 값은 뺀다. */
export interface Field {
  id: string;
  name: string;
  areaM2: number;
  coords: { lat: number; lng: number };
}

export function toField(row: FieldRow): Field {
  return {
    id: row.id,
    name: row.name,
    areaM2: row.area_m2,
    coords: { lat: row.latitude, lng: row.longitude },
  };
}
