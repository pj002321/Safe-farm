"use client";

import { useEffect, useRef, useState } from "react";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
import type {
  SigunguGddFeatureCollection,
  SigunguRainFeatureCollection,
  SigunguWarnFeatureCollection,
  SigunguWindFeatureCollection,
} from "@/shared/aiService/client";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";
import { Legend, LiveIndicator, WarningIconRow } from "./SigunguLegend";
import {
  GDD_DEFAULT_COLOR,
  type GddProperties,
  LAYER_LABEL,
  LAYER_SHORT,
  type Layer,
  MAP_CONTAINER_ID,
  NATIONWIDE_CENTER,
  NATIONWIDE_LEVEL,
  outerRings,
  POLL_MS,
  type RainProperties,
  type WarnProperties,
  type WindProperties,
} from "./sigunguLayers";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 레이어 지도 — GDD·기상특보 통합 (V1-40)
 *
 * [Description]
 * - 이전엔 SigunguGddMap·SigunguWarnMap 이 카카오맵 인스턴스를 각각 따로 띄웠다.
 *   두 지도가 같은 화면에 겹쳐 있으면 색이 뒤섞여 어느 레이어를 보는지 헷갈리므로,
 *   지도 인스턴스 하나에 레이어 토글을 얹어 **한 번에 하나의 레이어만** 칠한다.
 * - 두 데이터를 마운트 시 한 번에 받아 두고 캐시한다 — 토글은 다시 그리기만 할 뿐
 *   재요청하지 않는다.
 * - 범례에 데이터 기준일(`asOf`)을 함께 적는다. GDD 는 "올해 1/1~기준일 누적"이라
 *   기준일이 없으면 편차 색의 의미가 없고, 특보는 최신 스냅샷 시각이 곧 "이 정보가
 *   언제까지의 것인가"라 마찬가지로 상시 표기해야 오인을 막는다.
 * ---------------------------------------------
 */

/** 레이어 하나의 상태. 실패를 **값으로** 들고 있어야 무한 로더가 안 생긴다. */
type LayerState =
  | SigunguGddFeatureCollection
  | SigunguWarnFeatureCollection
  | SigunguRainFeatureCollection
  | SigunguWindFeatureCollection
  | "error"
  | null;

export function SigunguLayerMap() {
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [layer, setLayer] = useState<Layer>("gdd");
  /**
   * 레이어별로 따로 들고, **보이는 것만** 받는다.
   *
   * 예전에는 마운트 때 `Promise.all` 로 넷을 전부 받았다. 응답 하나가 3.04MB
   * (지오메트리가 98%)라 넷이면 12.15MB 고, 5Mbps 에서 첫 화면까지 7.2초였다 —
   * 그중 셋은 화면에 없는 레이어였다. 지금은 1개만 받고, 이미 받은 것은 다시
   * 받지 않는다.
   * ⚠️ 지오메트리가 네 벌 오는 것 자체는 그대로다. 근본 해결은 ai-service 가
   *    값만 주고 경계를 따로 캐시하는 것인데, 그건 양쪽 배포가 묶인다.
   */
  const [data, setData] = useState<Record<Layer, LayerState>>({
    gdd: null,
    warn: null,
    rain: null,
    wind: null,
  });
  // 선택은 **시군구 코드만** 들고 있는다. 속성 스냅샷을 들면 폴링으로 값이
  // 새로 와도 카드가 옛 숫자를 계속 보여준다.
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // 지도 인스턴스. state 가 아니라 ref 인 이유는 바뀌어도 렌더가 필요 없어서다.
  const mapRef = useRef<kakao.maps.Map | null>(null);

  // 보이는 레이어만 받는다. 이미 받아 둔 레이어는 다시 안 받으므로 토글은
  // 요청 0건으로 즉시 전환된다.
  //
  // 폴링은 **특보만** 한다. GDD 는 하루 한 번(서버가 date.today() 기준으로
  // 계산한다), 강수·바람도 시간 단위라 5분마다 3MB 를 다시 받을 이유가 없다.
  // 예전에는 넷을 전부 5분마다 받아 한 시간 체류에 146MB 가 나갔다.
  useEffect(() => {
    if (data[layer] && data[layer] !== "error") return;

    let alive = true;
    const load = () =>
      fetch(`/api/map/sigungu-${layer}`)
        .then((res) => res.json())
        .then((json) => {
          if (!alive) return;
          // ai-service 미연결("not-configured")도 200 으로 온다 — features 유무로 가른다.
          setData((prev) => ({
            ...prev,
            [layer]: "features" in json ? json : "error",
          }));
        })
        .catch(() => {
          if (!alive) return;
          // 이미 띄운 뒤의 일시 장애면 보이던 지도를 유지한다.
          setData((prev) => ({ ...prev, [layer]: prev[layer] ?? "error" }));
        });

    load();
    const interval = layer === "warn" ? setInterval(load, POLL_MS) : null;
    return () => {
      alive = false;
      if (interval) clearInterval(interval);
    };
  }, [layer, data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layer 는 재실행 신호다 — 레이어를 바꾸면 이전 선택 정보를 지운다.
  useEffect(() => {
    setSelectedCode(null);
  }, [layer]);

  /**
   * 지도 인스턴스는 **세션에 하나**다.
   *
   * 예전에는 레이어를 바꿀 때마다, 그리고 폴링이 새 객체를 넣을 때마다
   * `new sdk.maps.Map(...)` 을 다시 만들면서 중심·배율을 상수로 되돌렸다.
   * 자기 군까지 확대해 둔 사용자가 **5분마다 전국 축척으로 튕겨 나갔고**,
   * 두 레이어를 같은 자리에서 비교하는 것 자체가 불가능했다.
   * 이제 여기서 한 번만 만들고, 이후에는 아무도 중심·배율을 건드리지 않는다.
   */
  useEffect(() => {
    if (status !== "ready" || mapRef.current) return;

    const container = document.getElementById(MAP_CONTAINER_ID);
    const sdk = window.kakao;
    if (!container || !sdk) return;

    mapRef.current = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(NATIONWIDE_CENTER.lat, NATIONWIDE_CENTER.lng),
      level: NATIONWIDE_LEVEL,
    });
  }, [status]);

  // 폴리곤만 갈아 끼운다. 지도는 그대로 있으므로 사용자가 보던 위치가 유지된다.
  useEffect(() => {
    const map = mapRef.current;
    const current = data[layer];
    const sdk = window.kakao;
    if (!map || !sdk || !current || current === "error") return;

    const overlays: kakao.maps.Polygon[] = [];
    for (const feature of current.features) {
      const color = feature.properties.color;
      // 특보 없는 시군구는 안 그린다 — 대부분의 날엔 전국이 이 상태라, GDD 처럼
      // 항상 색을 칠하면 정작 봐야 할 경고가 묻힌다.
      if (layer === "warn" && !color) continue;

      const code = feature.properties.code;
      const isSelected = code === selectedCode;

      const path = outerRings(feature.geometry).map((ring) =>
        ring.map(([lng, lat]) => new sdk.maps.LatLng(lat, lng)),
      );
      const polygon = new sdk.maps.Polygon({
        path,
        fillColor: color ?? GDD_DEFAULT_COLOR,
        fillOpacity: isSelected ? 0.85 : layer === "gdd" ? 0.6 : 0.5,
        // 고른 곳을 **테두리로** 표시한다. 시군구 250개 중 227개가 44px 미만이라
        // 손가락으로 정확히 누르기 어렵다 — 표시가 없으면 아래 카드의 숫자가
        // 내가 누른 곳 것인지 옆 동네 것인지 알 방법이 없다.
        strokeWeight: isSelected ? 3 : 1,
        strokeColor: isSelected ? "#111111" : "#ffffff",
        strokeOpacity: isSelected ? 1 : 0.8,
      });
      polygon.setMap(map);
      overlays.push(polygon);

      sdk.maps.event.addListener(polygon, "click", () => {
        setSelectedCode(code);
      });
    }

    return () => {
      for (const overlay of overlays) overlay.setMap(null);
    };
  }, [layer, data, selectedCode]);

  const current = data[layer];
  const failed = current === "error";
  const ready = current !== null && current !== "error" ? current : null;
  const asOf = ready?.asOf;
  // SDK 가 아직이거나 이 레이어 데이터가 안 왔을 때만 로더를 띄운다.
  // **실패는 로더가 아니다** — 예전에는 실패해도 계속 돌아서, 고장인지 느린
  // 건지 알 수 없었다.
  const loading = !failed && (status !== "ready" || !ready);

  const warn = data.warn !== null && data.warn !== "error" ? data.warn : null;
  const warnList = layer === "warn" ? (warn as typeof warn) : null;
  const hasWarning = warnList?.features.some((f) => f.properties.color) ?? true;

  const selected =
    ready?.features.find((f) => f.properties.code === selectedCode) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <KakaoSdkScript onStatusChange={setStatus} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LayerToggle layer={layer} onChange={setLayer} />
        <LiveIndicator />
      </div>
      {warnList && <WarningIconRow data={warnList} />}
      {/*
        지도 칸을 relative 로 두고 로더를 그 위에 덮는다. 컨테이너를 조건부로
        렌더하면 카카오 SDK 가 붙을 div 가 사라져 지도가 영영 안 그려진다 —
        그래서 **컨테이너는 항상 두고** 덮기만 한다.
      */}
      <div className="relative">
        <div
          className="h-[24rem] w-full overflow-hidden rounded-lg border border-border sm:h-[28rem]"
          id={MAP_CONTAINER_ID}
        />
        {loading && (
          <div className="absolute inset-0 grid place-items-center rounded-lg border border-border bg-surface">
            <SatelliteScan labelKo={`${LAYER_LABEL[layer]} 지도를 읽는 중`} />
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 grid place-items-center rounded-lg border border-border bg-surface p-6 text-center">
            <div>
              <p className="font-medium text-fg">
                {LAYER_LABEL[layer]} 지도를 불러오지 못했습니다
              </p>
              <p className="mt-1 text-fg-muted text-sm">
                잠시 후 다시 시도해 주세요.
              </p>
              <button
                className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
                onClick={() => setData((prev) => ({ ...prev, [layer]: null }))}
                type="button"
              >
                다시 시도
              </button>
            </div>
          </div>
        )}
      </div>
      <Legend asOf={asOf} layer={layer} />
      {warnList && !hasWarning && (
        <p className="text-fg-muted text-sm">
          현재 발효 중인 기상특보가 없습니다.
        </p>
      )}
      {selected && (
        <RegionInfo layer={layer} properties={selected.properties} />
      )}
    </div>
  );
}

/** 정적인 색칠 지도로는 "지금도 갱신되고 있다"는 게 안 느껴져서 붙인 맥박 표시. */
function LayerToggle({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
}) {
  return (
    <div className="grid w-full grid-cols-4 gap-1 rounded-lg border border-border p-1 sm:inline-flex sm:w-fit">
      {(Object.keys(LAYER_LABEL) as Layer[]).map((id) => (
        <ToggleButton
          active={layer === id}
          key={id}
          onClick={() => onChange(id)}
        >
          {/* 좁으면 짧은 이름, 넓으면 전체 이름. 둘 다 DOM 에 있으므로 검색·
              스크린리더는 전체 이름을 읽는다. */}
          <span className="sm:hidden">{LAYER_SHORT[id]}</span>
          <span className="hidden sm:inline">{LAYER_LABEL[id]}</span>
        </ToggleButton>
      ))}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      // min-h-11 = 44px. 예전 py-1.5 는 32px 라 장갑 낀 손으로는 4px 간격의
      // 버튼 넷을 정확히 누르기 어려웠다(WCAG 2.5.5 / HIG 44).
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 font-medium text-sm transition-colors duration-200 ease-out-expo ${
        active ? "bg-accent text-accent-on" : "text-fg-muted hover:bg-surface-2"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function RegionInfo({
  layer,
  properties,
}: {
  layer: Layer;
  properties: GddProperties | WarnProperties | RainProperties | WindProperties;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
      <p className="font-medium text-fg">{properties.name}</p>
      <p className="mt-0.5 text-fg-muted">{detail(layer, properties)}</p>
    </div>
  );
}

/** 레이어마다 다른 한 줄. 값이 없으면 "데이터 없음"으로 정직하게 적는다. */
function detail(
  layer: Layer,
  p: GddProperties | WarnProperties | RainProperties | WindProperties,
): string {
  if (layer === "gdd") {
    const g = p as GddProperties;
    if (g.deviationPct == null) return g.label ?? "데이터 없음";
    const sign = g.deviationPct > 0 ? "+" : "";
    return `누적 ${g.actualGdd}GDD (평년 ${g.normalGdd}GDD, ${sign}${g.deviationPct}%) · ${g.label}`;
  }
  if (layer === "warn") return (p as WarnProperties).label ?? "특보 없음";
  if (layer === "rain") {
    const r = p as RainProperties;
    return `${r.rainMm != null ? `${r.rainMm}mm` : "데이터 없음"} · ${r.label}`;
  }
  const w = p as WindProperties;
  return `${w.windMax != null ? `${w.windMax}m/s` : "데이터 없음"} · ${w.label}`;
}
