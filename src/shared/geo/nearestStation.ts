/**
 * ---------------------------------------------
 * [Feature]: 밭에서 가장 가까운 관측소 고르기 (순수)
 *
 * [Description]
 * - GDD 를 쌓으려면 그 밭의 기온이 필요한데, 관측은 밭이 아니라 **관측소** 단위로
 *   들어온다. 그래서 밭마다 대신 읽을 관측소를 하나 고른다.
 * - 규칙은 `ai-service/app/service/ask_context.py` 의 `_nearest_station` 과
 *   같다 — 대권거리가 가장 짧은 곳. 화면과 LLM 이 다른 관측소를 보면 같은 밭에
 *   두 개의 누적 GDD 가 생긴다.
 * - 전수 비교로 충분하다. 관측소가 열 곳 안쪽이라 공간 인덱스를 들일 이유가 없다.
 * - 거리 공식이 `features/monitoring/domain/geo.ts` 에도 있지만 그쪽은 3D 지구본의
 *   좌표 규약(+Y 북극 등)과 한 묶음이고, features 끼리 import 는 막혀 있다.
 *   공유가 필요해지면 그때 `shared/` 로 올린다.
 *
 * [Usage]
 * ```ts
 * const station = nearestStation(plot, stations);
 * station?.stationCode; // "137"
 * ```
 * ---------------------------------------------
 */

export interface StationPoint {
  stationCode: string;
  nameKo: string | null;
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 두 좌표 사이 대권거리(km). */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) *
      Math.cos(toRadians(bLat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 가장 가까운 관측소. 목록이 비었으면 null.
 *
 * 거리가 같으면 앞의 것을 남긴다(`<` 비교). 순서가 바뀌어도 같은 답이 나오게
 * 하려는 것이라, 이 비교를 `<=` 로 바꾸지 말 것.
 */
export function nearestStation(
  plot: { latitude: number; longitude: number },
  stations: readonly StationPoint[],
): StationPoint | null {
  let best: StationPoint | null = null;
  let bestKm = Number.POSITIVE_INFINITY;

  for (const station of stations) {
    const km = distanceKm(
      plot.latitude,
      plot.longitude,
      station.latitude,
      station.longitude,
    );
    if (km < bestKm) {
      best = station;
      bestKm = km;
    }
  }

  return best;
}

/**
 * 가까운 순으로 늘어놓은 관측소.
 *
 * `nearestStation` 은 관측(`weather_obs_daily`)용이라 한 곳이면 되지만, 평년값
 * (`normals`)은 **관측소마다 있고 없고가 갈린다.** 가장 가까운 곳에 평년값이
 * 없을 때 다음 곳으로 물러설 수 있어야 해서 순서까지 필요하다.
 *
 * 거리가 같으면 원래 순서를 지킨다(`sort` 가 안정 정렬이다) — `nearestStation`
 * 이 `<` 로 앞의 것을 남기는 것과 같은 답이 나온다.
 */
export function stationsByDistance(
  plot: { latitude: number; longitude: number },
  stations: readonly StationPoint[],
): StationPoint[] {
  return [...stations].sort(
    (a, b) =>
      distanceKm(plot.latitude, plot.longitude, a.latitude, a.longitude) -
      distanceKm(plot.latitude, plot.longitude, b.latitude, b.longitude),
  );
}
