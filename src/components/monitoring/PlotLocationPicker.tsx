"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { Field } from "@/components/shared/Field";
import type { LatLon } from "@/features/monitoring/domain/geo";
import {
  PLOT_LOCATION_MESSAGE,
  validatePlotLocation,
} from "@/features/monitoring/domain/plotLocation";
import { searchAddress } from "@/shared/kakao/geocode";
import {
  KakaoSdkScript,
  type KakaoSdkStatus,
} from "@/shared/kakao/KakaoSdkScript";

/**
 * ---------------------------------------------
 * [Feature]: 밭 위치 선택 지도
 *
 * [Description]
 * - 밭 등록 폼이 쓰는 부품. 지도를 띄우고, 사용자가 클릭한 지점의 좌표를
 *   부모에게 돌려준다. 저장·검증은 하지 않는다 — 폼의 일이다.
 * - 좌표 타입은 `monitoring/domain/geo` 의 `LatLon` 을 그대로 쓴다. 지구본과
 *   같은 타입을 써야 나중에 등록된 밭을 지구본에도 찍을 수 있다.
 * - **카카오는 경도를 `lng`, 이 프로젝트는 `lon` 이라 부른다.** 경계에서 한 번만
 *   바꾸고, 안쪽에서는 프로젝트 이름으로 통일한다.
 * - **effect 를 셋으로 쪼갠 것은 의도다.** 지도 생성·마커 갱신·클릭 구독은 다시
 *   실행돼야 하는 조건이 서로 다르다. 한 덩어리로 두면 좌표가 바뀔 때마다 지도가
 *   통째로 새로 만들어져 화면이 깜빡이고, 사용자가 맞춰 둔 확대 수준도 날아간다.
 * - **첫 마커를 찍을 때만 지도를 이동시킨다.** 클릭할 때마다 중심을 옮기면
 *   지도가 커서 밑에서 미끄러져 다음 클릭이 빗나간다.
 *
 * [Usage]
 * ```tsx
 * const [coord, setCoord] = useState<LatLon | null>(null);
 * <PlotLocationPicker value={coord} onChange={setCoord} />
 * ```
 * ---------------------------------------------
 */

/** 상주시청. 좌표가 아직 없을 때의 첫 기준점 — 이 서비스의 관측 거점이다. */
const DEFAULT_CENTER: LatLon = { lat: 36.4109, lon: 128.159 };

/** 확대 수준. 1이 가장 가깝고 14가 가장 멀다. 3이면 필지 경계가 보인다. */
const DEFAULT_LEVEL = 3;

interface PlotLocationPickerProps {
  /** 지금 선택된 좌표. null 이면 마커를 찍지 않는다. */
  value: LatLon | null;
  /** 지도를 클릭해 좌표가 정해질 때 불린다. */
  onChange: (coord: LatLon) => void;
  /** 지도 높이. 폼 레이아웃에 맞춰 부모가 정한다. */
  className?: string;
}

export function PlotLocationPicker({
  value,
  onChange,
  className = "h-80",
}: PlotLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markerRef = useRef<kakao.maps.Marker | null>(null);
  const [status, setStatus] = useState<KakaoSdkStatus>("loading");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ① 지도 생성. SDK 가 준비된 뒤 한 번만 한다.
  useEffect(() => {
    if (status !== "ready") return;

    const container = containerRef.current;
    const sdk = window.kakao;
    if (!container || !sdk) return;

    mapRef.current = new sdk.maps.Map(container, {
      center: new sdk.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon),
      level: DEFAULT_LEVEL,
    });

    return () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [status]);

  // ② 선택된 좌표 → 마커. 이미 있으면 옮기고, 없으면 만든다.
  useEffect(() => {
    if (status !== "ready") return;

    const map = mapRef.current;
    const sdk = window.kakao;
    if (!map || !sdk) return;

    if (!value) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }

    const position = new sdk.maps.LatLng(value.lat, value.lon);

    if (markerRef.current) {
      markerRef.current.setPosition(position);
      return;
    }

    // 첫 마커일 때만 지도를 그쪽으로 옮긴다. 수정 화면에서 기존 위치를 보여주는
    // 경우가 여기다. 이후 클릭으로 옮길 때는 지도를 건드리지 않는다.
    markerRef.current = new sdk.maps.Marker({ position, map });
    map.setCenter(position);
  }, [status, value]);

  // ③ 지도 클릭 구독. onChange 가 바뀌면 새 함수로 다시 건다.
  useEffect(() => {
    if (status !== "ready") return;

    const map = mapRef.current;
    const sdk = window.kakao;
    if (!map || !sdk) return;

    const handleClick = (event: kakao.maps.MouseEvent) => {
      // 경계에서 lng → lon 으로 이름을 바꾼다.
      onChange({ lat: event.latLng.getLat(), lon: event.latLng.getLng() });
    };

    sdk.maps.event.addListener(map, "click", handleClick);

    return () => {
      sdk.maps.event.removeListener(map, "click", handleClick);
    };
  }, [status, onChange]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    // 폼 기본 동작은 페이지 새로고침이다. 막지 않으면 지도가 통째로 다시 뜬다.
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed || status !== "ready") return;

    setSearching(true);
    const found = await searchAddress(trimmed);
    setSearching(false);

    if (!found) {
      setSearchError("주소를 찾지 못했습니다. 시·군·면 단위로 입력해 보세요.");
      return;
    }

    setSearchError(null);
    onChange(found);

    // 검색은 "여기로 가 달라"는 요청이므로 지도를 반드시 옮긴다.
    // (effect ② 는 첫 마커일 때만 옮기므로 여기서 직접 부른다.)
    const sdk = window.kakao;
    if (sdk && mapRef.current) {
      mapRef.current.setCenter(new sdk.maps.LatLng(found.lat, found.lon));
    }
  }

  // 폼도 제출할 때 같은 함수로 검사한다. 여기 것은 즉시 알려주기 위한 것이다.
  const issue = value ? validatePlotLocation(value) : null;

  return (
    <div className="flex flex-col gap-3">
      <form className="flex items-end gap-2" onSubmit={handleSearch}>
        <div className="flex-1">
          <Field
            error={searchError ?? undefined}
            hint="주소로 대략 이동한 뒤, 지도를 클릭해 정확한 위치를 찍으세요."
            label="주소 검색"
            name="plot-address"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예) 경북 상주시 낙동면"
            value={query}
          />
        </div>

        <Button
          disabled={status !== "ready"}
          loading={searching}
          size="md"
          type="submit"
        >
          검색
        </Button>
      </form>

      <div
        className={`relative overflow-hidden rounded-lg border border-border ${className}`}
      >
        <KakaoSdkScript onStatusChange={setStatus} />
        <div ref={containerRef} className="size-full" />

        {status !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-surface p-4 text-center text-sm">
            {status === "loading" ? (
              <span className="text-fg-muted">지도를 불러오는 중…</span>
            ) : (
              <span className="text-unsuitable">
                지도를 불러오지 못했습니다. 카카오 개발자 콘솔 &gt; 플랫폼 &gt;
                Web 에 이 주소가 등록돼 있는지 확인하세요.
              </span>
            )}
          </div>
        )}
      </div>

      {issue && (
        <p className="text-sm text-unsuitable">
          {PLOT_LOCATION_MESSAGE[issue]}
        </p>
      )}
    </div>
  );
}
