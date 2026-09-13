/**
 * ---------------------------------------------
 * [Feature]: 지구 좌표 변환
 *
 * [Description]
 * - 3D 지구본이 쓰는 좌표 계산을 모아 둔다. **three.js 를 import 하지 않는다.**
 *   숫자만 다루면 테스트가 node 환경에서 밀리초 단위로 끝나고, 나중에 렌더러를
 *   바꾸거나 서버에서 같은 계산을 해도 이 파일은 그대로 쓴다.
 * - 축 규약은 three.js 기본값을 따른다: **+Y 가 북극**, 경도 0°가 +X,
 *   동경이 +Z 방향. 규약을 여기서 한 번만 정해 두지 않으면 위성과 핫스팟이
 *   서로 다른 반구에 찍힌다.
 *
 * [Usage]
 * ```ts
 * const p = latLonToVec3({ lat: 36.5, lon: 127.8 }, 2);
 * formatLatLon(vec3ToLatLon(p)); // → "36.50°N 127.80°E"
 * ```
 * ---------------------------------------------
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** 지구 평균 반지름 (km). 대권 거리 계산의 기준값. */
const EARTH_RADIUS_KM = 6371;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** 위경도를 반지름 radius 구면 위의 직교좌표로. Y축이 북극(three.js 기본 up). */
export function latLonToVec3(coord: LatLon, radius: number): Vec3 {
  const phi = coord.lat * DEG_TO_RAD;
  const lambda = coord.lon * DEG_TO_RAD;
  const ring = Math.cos(phi) * radius;

  return {
    x: ring * Math.cos(lambda),
    y: radius * Math.sin(phi),
    z: ring * Math.sin(lambda),
  };
}

/**
 * 위 함수의 역변환. 지구본에서 클릭한 지점 → 위경도.
 *
 * 원점(길이 0)은 위경도가 정의되지 않는다. 이때 NaN 을 흘려보내면 화면에
 * "NaN°N" 이 찍히므로 적도·본초자오선(0,0)으로 떨어뜨린다.
 */
export function vec3ToLatLon(v: Vec3): LatLon {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length === 0) return { lat: 0, lon: 0 };

  // 부동소수 오차로 |y/length| 가 1을 아주 살짝 넘으면 asin 이 NaN 을 낸다.
  const sinPhi = Math.min(1, Math.max(-1, v.y / length));

  return {
    lat: Math.asin(sinPhi) * RAD_TO_DEG,
    lon: Math.atan2(v.z, v.x) * RAD_TO_DEG,
  };
}

/**
 * 두 지점 사이 대권 거리 (km). 위성 커버리지 표시에 쓴다.
 *
 * 하버사인 공식을 쓴다. 코사인 법칙보다 짧은 거리에서 부동소수 오차가 작아,
 * 인접한 필지 두 곳의 거리도 0으로 뭉개지지 않는다.
 */
export function greatCircleDistanceKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const latA = a.lat * DEG_TO_RAD;
  const latB = b.lat * DEG_TO_RAD;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * 경사각 inclinationDeg 의 원궤도 위, 위상 t(0~1) 지점의 좌표. 위성 애니메이션용.
 *
 * 적도면 궤도(XZ 평면)를 X축 기준으로 기울인다. t 는 한 바퀴를 1로 보는 위상이라
 * t=0 과 t=1 은 같은 지점이고, 1을 넘겨도 그대로 감긴다(모듈로 불필요).
 */
export function orbitPosition(
  t: number,
  radius: number,
  inclinationDeg: number,
): Vec3 {
  const angle = (Number.isFinite(t) ? t : 0) * Math.PI * 2;
  const inclination = inclinationDeg * DEG_TO_RAD;

  const flatX = radius * Math.cos(angle);
  const flatZ = radius * Math.sin(angle);

  return {
    x: flatX,
    y: -flatZ * Math.sin(inclination),
    z: flatZ * Math.cos(inclination),
  };
}

/** 표시용 좌표 문자열. 예: "36.50°N 127.80°E" */
export function formatLatLon(coord: LatLon): string {
  // 반올림을 먼저 한다. -0.001 을 "0.00°S" 로 쓰지 않기 위해서다.
  const lat = Math.round(coord.lat * 100) / 100;
  const lon = Math.round(coord.lon * 100) / 100;

  const latText = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}`;
  const lonText = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

  return `${latText} ${lonText}`;
}
