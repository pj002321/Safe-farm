"use client";

import { useCallback, useEffect, useState } from "react";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
import type { PlotMapPoint } from "@/features/plots/domain/plotSummary";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";
import { LayerToggle } from "./MapControls";
import {
  Legend,
  LiveIndicator,
  RegionInfo,
  WarnSummary,
} from "./SigunguLegend";
import {
  LAYER_LABEL,
  type Layer,
  MAP_CONTAINER_ID,
  NATIONWIDE_CENTER,
  NATIONWIDE_LEVEL,
  PLOT_VIEW_LEVEL,
} from "./sigunguLayers";
import { usePlotMarkers } from "./usePlotMarkers";
import { useSigunguLayer, useSigunguPolygons } from "./useSigunguLayer";

/**
 * ---------------------------------------------
 * [Feature]: 지도 작업 화면 — 내 밭 + 지역 기상 (한 장의 지도)
 *
 * [Description]
 * - **지도가 하나다.** 예전 `/map` 은 카카오맵 인스턴스를 둘(`PlotsMap`,
 *   `SigunguLayerMap`) 세로로 쌓았다. 그게 이 화면이 "보기 불편"했던 원인이다:
 *     · 카카오맵은 기본값으로 드래그·휠을 자기가 먹는다. 384px 짜리 지도 둘이
 *       세로로 붙어 있으면 모바일에서 **페이지를 내리다 두 번 갇힌다.**
 *     · 내 밭과 그 지역 기상이 서로 다른 지도에 있어, 정작 하고 싶은 일
 *       (“내 밭 자리는 지금 무슨 색인가”)을 한 화면에서 할 수 없었다.
 *     · 같은 SDK 를 두 번 붙이느라 로더에 폴링 우회까지 들어가 있었다.
 *   이제 마커와 시군구 색칠이 **같은 지도**에 얹힌다.
 * - **처음 보이는 곳이 내 밭이다.** 전국 뷰(레벨 13)에서는 시군구 250개 중
 *   227개가 44px 미만이라 손가락으로 고를 수 없었다. 밭이 있으면 그 자리에서
 *   시작하고, 전국은 버튼으로 간다.
 * - 지도 높이를 `svh` 로 잡는다. `dvh` 는 모바일 주소창이 접힐 때 값이 바뀌어
 *   지도가 스크롤 도중 리사이즈되고, 카카오맵은 그때 `relayout()` 을 불러주지
 *   않으면 타일이 어긋난다. `svh` 는 그 동안 고정이다.
 *
 * [Usage]
 * ```tsx
 * <MapWorkspace points={plots} />
 * ```
 * ---------------------------------------------
 */

interface MapWorkspaceProps {
  points: readonly PlotMapPoint[];
}

export function MapWorkspace({ points }: MapWorkspaceProps) {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [layer, setLayer] = useState<Layer>("gdd");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  /**
   * 지도 인스턴스를 **상태로** 들고 있다.
   *
   * ⚠️ ref 로 두면 지도가 생겨도 렌더가 일어나지 않아, 마커·폴리곤 훅이 자기
   *    의존성이 바뀐 줄 모른다. 카카오 SDK(외부)가 우리 API 보다 느린 날이면
   *    데이터가 먼저 도착해 훅이 한 번 돌고 끝나는데 그때 지도는 아직 없다 —
   *    그대로 **빈 지도**가 된다. 값이 바뀌는 것이 곧 신호여야 한다.
   */
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  const { current, warn, retry } = useSigunguLayer(layer);

  /** 내 밭이 보이도록 맞춘다. 첫 진입과 "내 밭" 버튼이 같은 함수를 쓴다. */
  const focusPlots = useCallback(
    (target: kakao.maps.Map) => {
      const sdk = window.kakao;
      if (!sdk || points.length === 0) return;

      if (points.length === 1) {
        const only = points[0];
        target.setCenter(new sdk.maps.LatLng(only.latitude, only.longitude));
        target.setLevel(PLOT_VIEW_LEVEL);
        return;
      }

      const bounds = new sdk.maps.LatLngBounds();
      for (const point of points) {
        bounds.extend(new sdk.maps.LatLng(point.latitude, point.longitude));
      }
      target.setBounds(bounds);
      // 밭 둘이 200m 거리면 setBounds 가 골목 단위까지 당긴다. 그 배율에서는
      // 시군구 폴리곤이 화면을 통째로 덮어 색이 무슨 뜻인지 알 수 없다.
      if (target.getLevel() < PLOT_VIEW_LEVEL) target.setLevel(PLOT_VIEW_LEVEL);
    },
    [points],
  );

  const focusNation = useCallback((target: kakao.maps.Map) => {
    const sdk = window.kakao;
    if (!sdk) return;
    target.setCenter(
      new sdk.maps.LatLng(NATIONWIDE_CENTER.lat, NATIONWIDE_CENTER.lng),
    );
    target.setLevel(NATIONWIDE_LEVEL);
  }, []);

  /**
   * 지도는 **세션에 하나**다. 레이어를 바꾸거나 폴링이 새 데이터를 넣어도 다시
   * 만들지 않는다 — 예전에는 그때마다 새로 만들어, 자기 군까지 확대해 둔 사용자가
   * 5분마다 전국 축척으로 튕겨 나갔다.
   */
  useEffect(() => {
    if (status !== "ready" || map) return;

    const container = document.getElementById(MAP_CONTAINER_ID);
    const sdk = window.kakao;
    if (!container || !sdk) return;

    const created = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(NATIONWIDE_CENTER.lat, NATIONWIDE_CENTER.lng),
      level: NATIONWIDE_LEVEL,
    });
    // 밭이 없으면 전국 그대로 둔다 — 그때는 전국이 유일하게 보여 줄 게 있는 뷰다.
    focusPlots(created);
    setMap(created);
  }, [status, map, focusPlots]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layer 는 읽는 값이 아니라 재실행 신호다 — 레이어를 바꾸면 이전 선택은 의미가 없다(같은 시군구라도 보여 줄 값이 다르다).
  useEffect(() => {
    setSelectedCode(null);
  }, [layer]);

  usePlotMarkers(map, points);
  useSigunguPolygons({
    map,
    layer,
    data: current,
    selectedCode,
    onSelect: setSelectedCode,
  });

  /**
   * 실패는 **둘**이다. 예전에는 레이어 데이터 실패만 봤다.
   *
   * ⚠️ 카카오 SDK 가 죽는 경우(도메인 미등록으로 401, 광고 차단기·사내 프록시가
   *    dapi.kakao.com 을 막음, 카카오 CDN 장애)에는 같은 출처인 `/api/map/*` 는
   *    멀쩡히 성공한다. 그래서 `current` 는 정상이고 `failed` 는 false 인 채로
   *    `status` 만 "error" 가 되는데, 그러면 `loading` 이 **영원히 true** 라
   *    위성 스캔 애니메이션이 지도 자리를 덮은 채 끝나지 않았다. 오류 문구도
   *    없고 누를 것도 없다. 같은 로더를 쓰는 `PlotLocationStep` 은 이 값을
   *    이미 처리하고 있었다 — 여기만 빠뜨렸다.
   */
  const sdkFailed = status === "error";
  const failed = current === "error" || sdkFailed;
  const ready = current !== null && current !== "error" ? current : null;
  // SDK 가 아직이거나 이 레이어 데이터가 안 왔을 때만 로더를 띄운다.
  // **실패는 로더가 아니다** — 계속 돌면 고장인지 느린 건지 알 수 없다.
  const loading = !failed && (status !== "ready" || !ready);

  const selected =
    ready?.features.find((f) => f.properties.code === selectedCode) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <KakaoSdkScript onStatusChange={setStatus} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <LayerToggle layer={layer} onChange={setLayer} />
        <LiveIndicator />
      </div>

      {warn && <WarnSummary data={warn} />}

      {/*
        지도 칸을 relative 로 두고 로더·버튼을 그 위에 덮는다. 컨테이너를 조건부로
        렌더하면 카카오 SDK 가 붙을 div 가 사라져 지도가 영영 안 그려진다 —
        그래서 **컨테이너는 항상 두고** 덮기만 한다.
      */}
      <div className="relative">
        <div
          className="h-[52svh] min-h-[20rem] w-full overflow-hidden rounded-xl border border-border"
          id={MAP_CONTAINER_ID}
        />

        {map && (
          <div className="absolute top-3 right-3 z-20 flex gap-1.5">
            {points.length > 0 && (
              <ViewButton onClick={() => focusPlots(map)}>내 밭</ViewButton>
            )}
            <ViewButton onClick={() => focusNation(map)}>전국</ViewButton>
          </div>
        )}

        {/*
          ⚠️ z-30 이 없으면 **타일 밑에 깔린다.** 카카오가 컨테이너 안에 심는
             요소들은 z-index 를 갖는데(실측 최대 2), 이 오버레이는 auto 라
             DOM 순서가 뒤여도 그 아래로 그려졌다. 실제로 실패 안내가 DOM 에는
             있는데 화면에는 안 보이는 상태였다(elementFromPoint 가 타일 SVG 를
             돌려줬다). 반투명으로 둔 건 레이어를 바꾸는 동안 보던 지도가
             그대로 비쳐서, 화면이 비는 게 아니라 **갱신 중**으로 읽히게 하려는 것.
        */}
        {loading && (
          <div className="absolute inset-0 z-30 grid place-items-center rounded-xl border border-border bg-surface/80 backdrop-blur-sm">
            <SatelliteScan labelKo={`${LAYER_LABEL[layer]} 지도를 읽는 중`} />
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 z-30 grid place-items-center rounded-xl border border-border bg-surface/95 p-6 text-center backdrop-blur-sm">
            <div>
              <p className="font-medium text-fg">
                {sdkFailed
                  ? "지도를 불러오지 못했습니다"
                  : `${LAYER_LABEL[layer]} 지도를 불러오지 못했습니다`}
              </p>
              <p className="mt-1 text-fg-muted text-sm">
                {sdkFailed
                  ? "지도 서비스에 연결하지 못했습니다. 광고 차단 확장을 끄고 새로고침해 주세요."
                  : "잠시 후 다시 시도해 주세요."}
              </p>
              {/* SDK 가 죽은 경우에는 버튼을 안 준다 — 다시 시도는 레이어 데이터만
                  다시 받으므로 눌러도 아무것도 나아지지 않는다. 할 수 없는 일을
                  버튼으로 권하지 않는다. */}
              {!sdkFailed && (
                <button
                  className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
                  onClick={retry}
                  type="button"
                >
                  다시 시도
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <Legend asOf={ready?.asOf} layer={layer} />

      {/* 선택 전에도 자리를 비워 두지 않는다 — 무엇을 눌러야 하는지 알려 준다. */}
      {selected ? (
        <RegionInfo layer={layer} properties={selected.properties} />
      ) : (
        <p className="rounded-lg border border-border border-dashed px-4 py-3 text-fg-muted text-sm">
          지도에서 시군구를 누르면 그 지역의 실제 수치를 보여 드립니다.
        </p>
      )}
    </div>
  );
}

/** 지도 위에 얹는 시점 이동 버튼. 지도가 준비된 뒤에만 그려진다. */
function ViewButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface/90 px-3 font-medium text-fg text-sm shadow-sm backdrop-blur transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
