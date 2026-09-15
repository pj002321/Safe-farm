"use client";

import { useEffect, useRef, useState } from "react";
import {
  LocationSummary,
  type SelectedLocation,
} from "@/components/plot/LocationSummary";
import { PlotMapControls } from "@/components/plot/PlotMapControls";
import {
  PLOT_MAP_CONTAINER_ID,
  PlotMapFrame,
} from "@/components/plot/PlotMapFrame";
import { toKmaGrid } from "@/features/monitoring/domain/kmaGrid";
import {
  PLOT_LOCATION_MESSAGE,
  type PlotLocationIssue,
  validatePlotLocation,
} from "@/features/monitoring/domain/plotLocation";
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

  /** 검색·현재 위치가 지도를 옮길 수 있도록 인스턴스를 들고 있는다. */
  const mapRef = useRef<kakao.maps.Map | null>(null);

  /**
   * 지금 왜 등록할 수 없는지. `selected` 가 null 인 이유를 담는다.
   *
   * `selected` 에서 계산해낼 수 없다 — 값이 없다는 사실만으로는 "아직 안 골랐다"와
   * "바다다"를 구분하지 못한다. 판정한 자리에서 직접 기록한다.
   */
  const [issue, setIssue] = useState<PlotLocationIssue | null>(null);

  /**
   * 마지막으로 조회한 중심 좌표.
   *
   * `idle` 은 확대·축소에서도 뜨는데 그때 중심은 그대로다. 같은 좌표를 다시
   * 물어보면 왕복만 낭비된다. 첫 화면에서 직접 부르는 한 번과 뒤따라 오는
   * `idle` 한 번이 겹치는 것도 여기서 걸러진다.
   */
  const lastCoordRef = useRef<{ lat: number; lon: number } | null>(null);

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
    mapRef.current = map;

    async function readCenter() {
      const center = map.getCenter();
      const coord = { lat: center.getLat(), lon: center.getLng() };

      const last = lastCoordRef.current;
      if (last && last.lat === coord.lat && last.lon === coord.lon) return;
      lastCoordRef.current = coord;

      // 좌표만으로 판단되는 문제는 물어보기 전에 거른다. 국외면 카카오에 주소를
      // 물어볼 이유가 없으므로 왕복도 아낀다.
      const coordIssue = validatePlotLocation(coord);
      if (coordIssue) {
        setSelected(null);
        setIssue(coordIssue);
        return;
      }

      const grid = toKmaGrid(coord);

      const token = ++requestRef.current;
      const region = await reverseGeocode(coord);

      // 기다리는 사이 지도가 더 움직였거나 화면이 사라졌다. 이 응답은 낡았다.
      if (token !== requestRef.current) return;

      // 국내 범위인데 주소가 없다 — 바다·하천·비무장지대다. "아직 안 골랐다"와
      // 구분해서 알려야 사용자가 무엇을 해야 할지 안다.
      if (!region) {
        setSelected(null);
        setIssue("no-address");
        return;
      }

      setIssue(null);

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

    // 컨테이너 크기가 바뀌면 지도에게 알린다. 마법사가 CSS 로만 단계를 바꾸므로
    // (page.tsx 의 group-has), 1단계가 숨겨진 동안 창이 줄면 지도는 옛 폭을 그대로
    // 들고 있다가 돌아왔을 때 타일이 잘린다. 더 나쁜 건 화면의 중앙 핀과
    // getCenter() 가 어긋나 **사용자가 본 곳과 다른 좌표가 저장되는** 것이다.
    //
    // ⚠️ display:none 이면 0 이 들어온다. 그 값으로 relayout 하면 지도를 0 크기로
    // 만들어 버리므로, 보일 때만 부른다.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) map.relayout();
    });
    observer.observe(container);

    // 지도를 만든 직후에는 idle 이 오지 않을 수 있다. 첫 값은 직접 채운다.
    void readCenter();

    return () => {
      sdk.maps.event.removeListener(map, "idle", handleIdle);
      observer.disconnect();
      mapRef.current = null;
      lastCoordRef.current = null;
      // 늦게 도착할 응답이 사라진 화면을 되살리지 못하게 번호를 넘겨 둔다.
      requestRef.current += 1;
    };
  }, [status]);

  /** 검색·현재 위치가 부르는 이동. setCenter 가 idle 을 일으켜 요약도 따라 갱신된다. */
  function goTo(coord: { lat: number; lon: number }) {
    const sdk = window.kakao;
    const map = mapRef.current;
    if (!sdk || !map) return;

    map.setCenter(new sdk.maps.LatLng(coord.lat, coord.lon));
  }

  return (
    <>
      <KakaoSdkScript onStatusChange={setStatus} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PlotMapFrame
          controls={
            <PlotMapControls disabled={status !== "ready"} onGoTo={goTo} />
          }
        />
        <div className="self-start">
          <LocationSummary selected={selected} />
          {issue && (
            <p className="mt-2 text-sm text-unsuitable">
              {PLOT_LOCATION_MESSAGE[issue]}
            </p>
          )}
          {/* SDK 를 못 받으면 지도와 주소 검색이 함께 죽는다 — 둘 다 window.kakao
              를 쓴다. 좌표 문제와 성격이 달라 PLOT_LOCATION_MESSAGE 에는 넣지 않는다.
              `<output>` 은 role="status" 를 기본으로 가진다. p+role 조합보다 보조기기
              지원이 넓고 biome 의 a11y/useSemanticElements 도 이쪽을 요구한다
              (ConsentFields·Skeleton 과 같은 방식). */}
          {status === "error" && (
            <output className="mt-2 block text-sm text-unsuitable">
              지도를 불러오지 못했습니다. 새로고침해 주세요.
            </output>
          )}
        </div>
      </div>
    </>
  );
}
