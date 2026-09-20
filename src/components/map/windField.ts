import type { SigunguWindFeatureCollection } from "@/shared/aiService/client";
import { centroid } from "./sigunguLayers";

/**
 * ---------------------------------------------
 * [Feature]: 바람장 보간 — 관측소 값에서 화면 격자점 값을 만든다
 *
 * [Description]
 * - 실측은 관측소 100개뿐이다. Windy 처럼 화면 전체를 화살표로 덮으려면 그
 *   사이 빈 곳의 방향을 **역거리가중(IDW)** 으로 채워야 한다 — 가까운
 *   관측소일수록 더 크게 반영한다.
 * - 각도는 그냥 평균 내면 0°/360° 경계에서 깨진다(0°와 359°의 평균이 180°로
 *   나옴). 단위벡터(sin, cos)로 바꿔 가중 평균한 뒤 각도로 되돌린다.
 * ---------------------------------------------
 */

export interface WindSample {
  lat: number;
  lng: number;
  deg: number;
}

/** 관측소별 대표점 하나(그 관측소를 쓰는 첫 시군구의 중심)를 뽑는다. */
export function stationSamples(
  data: SigunguWindFeatureCollection,
): WindSample[] {
  const seen = new Set<string>();
  const samples: WindSample[] = [];
  for (const feature of data.features) {
    const { station, windDeg } = feature.properties;
    if (windDeg == null || !station || seen.has(station)) continue;
    seen.add(station);
    const { lat, lng } = centroid(feature.geometry);
    samples.push({ lat, lng, deg: windDeg });
  }
  return samples;
}

/** IDW로 (lat, lng) 지점의 방향을 보간한다. 표본이 없으면 null. */
export function interpolateDeg(
  samples: WindSample[],
  lat: number,
  lng: number,
): number | null {
  let sinSum = 0;
  let cosSum = 0;
  let weightSum = 0;
  for (const s of samples) {
    const dist = Math.hypot(s.lat - lat, s.lng - lng) || 1e-6;
    const weight = 1 / (dist * dist);
    const rad = (s.deg * Math.PI) / 180;
    sinSum += Math.sin(rad) * weight;
    cosSum += Math.cos(rad) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return null;
  const deg =
    (Math.atan2(sinSum / weightSum, cosSum / weightSum) * 180) / Math.PI;
  return (deg + 360) % 360;
}
