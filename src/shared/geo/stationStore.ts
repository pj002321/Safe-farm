import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import type { StationPoint } from "./nearestStation";

/**
 * ---------------------------------------------
 * [Feature]: 기상 관측소 목록 (서버 전용)
 *
 * [Description]
 * - `stations` 는 ai-service 가 적재하는 **공용 참조 데이터**라 `user_id` 가 없고
 *   RLS 도 없다. 그래서 features 밑이 아니라 shared 에 둔다 — 생육 게이지
 *   (`cultivations`)와 날씨 차트(`monitoring`)가 같이 읽는데, features 끼리는
 *   import 할 수 없다(AGENTS.md).
 * - 열 곳 안쪽이라 전량 읽고 거리 비교는 메모리에서 한다. PostGIS 없이도 충분하다.
 * - ⚠️ `numeric` 은 supabase-js 가 **문자열로** 준다. 경계인 여기서 숫자로 바꾼다.
 * ---------------------------------------------
 */

function num(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listStations(): Promise<StationPoint[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("stations")
    .select("station_code, name, latitude, longitude");

  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const lat = num(row.latitude);
    const lon = num(row.longitude);
    // 좌표가 깨진 관측소는 후보에서 뺀다. 0,0 으로 두면 적도 한가운데가 되어
    // 늘 "가장 먼 곳"이 되거나, 다른 값이 깨졌을 때 뽑혀 버린다.
    if (lat === null || lon === null) return [];
    return [
      {
        stationCode: row.station_code,
        nameKo: row.name,
        latitude: lat,
        longitude: lon,
      },
    ];
  });
}
