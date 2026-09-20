"use client";

import { useEffect, useState } from "react";
import type { TyphoonPoint, TyphoonTrack } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 지도 태풍 레이어 (카카오 오버레이)
 *
 * [Description]
 * - 시군구 레이어(useSigunguLayer)와 **같은 지도 인스턴스**에 얹는다. 지도를 하나 더
 *   만들지 않는다 — 두 개면 줌·중심이 어긋나 사용자가 다른 데를 본다.
 * - 발표가 하루 4번뿐이라 시군구 특보처럼 폴링하지 않는다. 한 번 받고,
 *   신선도는 Next `fetch` 의 1시간 캐시(client.ts `typhoonTrack`)에 맡긴다.
 * - 분석은 실선, 예측은 점선으로 **반드시 가른다.** 한 줄로 이으면 예보를 관측처럼
 *   읽는다. 색까지 다르게 준다(색약 대비: 선 모양이 1차, 색이 2차).
 * - 예보원은 Circle 로 그린다. 반경 단위가 **m** 다 — RAD 는 km 라 1000 을 곱한다.
 *   실제로 이 단위를 빼먹어 반경 40m 짜리 점이 찍힌 적이 있다(강풍반경도 같다).
 *
 * [Usage]
 * ```tsx
 * const { track } = useTyphoonTrack();
 * useTyphoonLayer(map, track, { cone: true, wind: false });
 * ```
 * ---------------------------------------------
 */

/** 태풍 경로를 한 번 받는다. 없으면(평상시) analysis·forecast 가 빈 배열로 온다 — 오류가 아니다. */
export function useTyphoonTrack(): { track: TyphoonTrack | null } {
  const [track, setTrack] = useState<TyphoonTrack | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/map/typhoon")
      .then((res) => res.json())
      .then((json) => {
        if (alive && "analysis" in json) setTrack(json);
      })
      .catch(() => {
        // 조용히 실패한다 — 태풍 레이어는 부가 정보라, 못 받아도 나머지 지도는 그대로 쓴다.
      });
    return () => {
      alive = false;
    };
  }, []);

  return { track };
}

export function useTyphoonLayer(
  map: kakao.maps.Map | null,
  track: TyphoonTrack | null,
  show: { cone: boolean; wind: boolean },
): void {
  useEffect(() => {
    if (!map || !track) return;
    const sdk = window.kakao;
    if (!sdk) return;
    const shapes: Array<{ setMap: (m: kakao.maps.Map | null) => void }> = [];

    const toPath = (pts: TyphoonPoint[]) =>
      pts.map((p) => new sdk.maps.LatLng(p.lat, p.lon));

    // 분석 — 실선. 지나온 길이라 불확실성 표시가 없다
    if (track.analysis.length > 1) {
      shapes.push(
        new sdk.maps.Polyline({
          path: toPath(track.analysis),
          strokeWeight: 4,
          strokeColor: "#5a41e0",
          strokeStyle: "solid",
        }),
      );
    }

    // 예측 — 점선. 분석의 마지막 점에서 이어 붙인다.
    // 안 이으면 두 선 사이가 끊겨 "여기서 사라졌다 저기서 나타난다"로 보인다
    if (track.forecast.length > 0) {
      const last = track.analysis.at(-1);
      const path = toPath(last ? [last, ...track.forecast] : track.forecast);
      shapes.push(
        new sdk.maps.Polyline({
          path,
          strokeWeight: 4,
          strokeColor: "#d9480f",
          strokeStyle: "shortdash",
        }),
      );
    }

    for (const p of track.forecast) {
      // 예보원 — 중심이 어디쯤일지의 불확실성. 뒤로 갈수록 커진다
      if (show.cone && p.forecastRadiusKm) {
        shapes.push(
          new sdk.maps.Circle({
            center: new sdk.maps.LatLng(p.lat, p.lon),
            radius: p.forecastRadiusKm * 1000, // ⚠ km → m
            strokeWeight: 1,
            strokeColor: "#f08c00",
            strokeOpacity: 0.7,
            fillColor: "#f08c00",
            fillOpacity: 0.08,
          }),
        );
      }
      // 강풍반경 — 실제로 바람이 부는 범위. 없으면(-999 → null) 그리지 않는다
      if (show.wind && p.rad15Km) {
        shapes.push(
          new sdk.maps.Circle({
            center: new sdk.maps.LatLng(p.lat, p.lon),
            radius: p.rad15Km * 1000,
            strokeWeight: 1,
            strokeColor: "#868e96",
            strokeOpacity: 0.5,
            fillOpacity: 0,
          }),
        );
      }
    }

    for (const s of shapes) s.setMap(map);
    // 레이어를 끄거나 자료가 바뀌면 **반드시 걷는다.** 카카오 오버레이는 지도에 붙으면
    // 컴포넌트가 사라져도 남는다 — 안 걷으면 토글할 때마다 선이 겹쳐 쌓인다
    return () => {
      for (const s of shapes) s.setMap(null);
    };
  }, [map, track, show.cone, show.wind]);
}
