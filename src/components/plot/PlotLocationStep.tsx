"use client";

import { useEffect, useRef, useState } from "react";
import {
  LocationSummary,
  type SelectedLocation,
} from "@/components/plot/LocationSummary";
import {
  PLOT_MAP_CONTAINER_ID,
  PlotMapFrame,
} from "@/components/plot/PlotMapFrame";
import { toKmaGrid } from "@/features/monitoring/domain/kmaGrid";
import { reverseGeocode } from "@/shared/kakao/geocode";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";

/**
 * ---------------------------------------------
 * [Feature]: 밭 등록 1단계 — 위치 지정
 *
 * [Description]
 * - 지도·요약 카드를 한 상태로 묶는 유일한 클라이언트 컴포넌트다. 페이지와
 *   `PlotMapFrame` 은 서버 컴포넌트로 남는다 — 상태가 필요한 부분만 클라이언트로
 *   내려야 번들이 작아진다.
 * - **지도 중심이 곧 선택 좌표다.** `PlotMapFrame` 이 중앙 핀 방식으로 설계돼
 *   있어(핀은 고정, 지도를 끈다) 클릭이 아니라 `idle` 을 듣는다.
 * - `idle` 은 **움직임이 멎은 뒤 한 번** 온다. 드래그하는 내내 오지 않으므로
 *   역지오코딩을 손 뗀 순간에만 부르게 된다 — 별도 디바운스가 필요 없다.
 * - **격자는 즉시, 주소는 나중에** 정해진다. 격자는 순수 계산이라 같은 프레임에서
 *   끝나지만 주소는 카카오에 물어봐야 한다. 그래서 둘을 한 번에 `setSelected` 로
 *   묶어 넣는다 — 따로 넣으면 격자만 바뀐 중간 상태가 화면에 스친다.
 * - 지도를 빨리 여러 번 끌면 **응답이 순서대로 오지 않는다.** 요청 번호를 달아
 *   마지막 것만 반영한다(아래 `requestRef` 참고).
 *
 * [Usage]
 * ```tsx
 * // page.tsx (서버 컴포넌트)에서
 * <PlotLocationStep />
 * ```
 * ---------------------------------------------
 */

/** 지도의 첫 중심. 상주시청 — 이 서비스의 관측 거점이다. */
const DEFAULT_CENTER = { lat: 36.4109, lon: 128.159 };

/** 확대 수준. 4면 마을 단위가 보여 밭을 찾아 들어가기 좋다. */
const DEFAULT_LEVEL = 4;

export function PlotLocationStep() {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [selected, setSelected] = useState<SelectedLocation | null>(null);

  /**
   * 마지막으로 보낸 역지오코딩 요청 번호.
   *
   * 지도를 서울 → 부산으로 빠르게 끌면 두 요청이 동시에 떠 있게 되는데, 먼저
   * 보낸 서울 응답이 나중에 도착할 수 있다. 그러면 화면은 부산인데 주소는
   * 서울로 남는다. 번호가 최신이 아닌 응답은 버려서 이걸 막는다.
   */
  const requestRef = useRef(0);

  useEffect(() => {
    if (status !== "ready") return;

    // 지도가 붙을 자리는 PlotMapFrame 이 이미 그려 두었다. 우리는 만들지 않고
    // 약속된 id 로 찾아 쓴다(PLOT_MAP_CONTAINER_ID).
    const container = document.getElementById(PLOT_MAP_CONTAINER_ID);
    const sdk = window.kakao;
    if (!container || !sdk) return;

    const map = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon),
      level: DEFAULT_LEVEL,
    });

    async function readCenter() {
      const center = map.getCenter();
      const coord = { lat: center.getLat(), lon: center.getLng() };
      const grid = toKmaGrid(coord);

      const token = ++requestRef.current;
      const region = await reverseGeocode(coord);

      // 기다리는 사이 지도가 더 움직였거나 화면이 사라졌다. 이 응답은 낡았다.
      if (token !== requestRef.current) return;

      if (!region) {
        setSelected(null);
        return;
      }

      setSelected({
        addressKo: region.addressKo,
        latitude: coord.lat,
        longitude: coord.lon,
        gridX: grid.nx,
        gridY: grid.ny,
        regionCode: region.regionCode,
        regionKo: region.regionKo,
      });
    }

    const handleIdle = () => {
      // 이벤트 핸들러는 Promise 를 받지 않는다. void 로 "기다리지 않음"을 밝힌다.
      void readCenter();
    };

    sdk.maps.event.addListener(map, "idle", handleIdle);

    // 지도를 만든 직후에는 idle 이 오지 않을 수 있다. 첫 값은 직접 채운다.
    void readCenter();

    return () => {
      sdk.maps.event.removeListener(map, "idle", handleIdle);
      // 늦게 도착할 응답이 사라진 화면을 되살리지 못하게 번호를 넘겨 둔다.
      requestRef.current += 1;
    };
  }, [status]);

  return (
    <>
      <KakaoSdkScript onStatusChange={setStatus} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PlotMapFrame />
        <div className="self-start">
          <LocationSummary selected={selected} />
        </div>
      </div>
    </>
  );
}
