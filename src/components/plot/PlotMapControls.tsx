"use client";

import { type KeyboardEvent, useState } from "react";
import { MapPinIcon } from "@/components/icons";
import { type GeocodedCoord, searchAddress } from "@/shared/kakao/geocode";

/**
 * ---------------------------------------------
 * [Feature]: 지도 조작 줄 — 주소 검색 · 현재 위치
 *
 * [Description]
 * - 지도를 직접 만지지 않는다. "여기로 가 달라"고 좌표만 올려보내고(`onGoTo`),
 *   실제 이동은 지도를 쥐고 있는 `PlotLocationStep` 이 한다. 지도 인스턴스를
 *   props 로 넘기면 이 컴포넌트가 지도의 수명까지 신경 써야 한다.
 * - **`<form>` 을 쓰지 않는다.** 이 줄은 밭 등록 페이지의 `<form>` 안에 놓이는데,
 *   form 중첩은 HTML 이 금지한다(브라우저가 조용히 무시한다). 대신 Enter 키를
 *   직접 받고 `preventDefault()` 로 바깥 폼의 제출을 막는다.
 * - **input 에 `name` 을 주지 않는다.** 주소 검색어는 등록 값이 아니다. 이름이
 *   있으면 바깥 폼 제출에 `addressQuery` 가 딸려 간다.
 * - 실패 이유를 구분하지 않는다(권한 거부·시간 초과·측위 실패). 어느 쪽이든
 *   사용자가 할 일은 "주소로 찾기" 하나뿐이라 나눠 봐야 선택지가 늘지 않는다.
 *
 * [Usage]
 * ```tsx
 * <PlotMapFrame controls={<PlotMapControls onGoTo={goTo} disabled={!ready} />} />
 * ```
 * ---------------------------------------------
 */

interface PlotMapControlsProps {
  /** 지도를 이 좌표로 옮겨 달라는 요청. */
  onGoTo: (coord: GeocodedCoord) => void;
  /** SDK 가 아직 준비되지 않음. */
  disabled?: boolean;
}

/** 위치 확인을 기다리는 한계. 넘으면 실패로 보고 주소 검색을 권한다. */
const GEOLOCATION_TIMEOUT_MS = 10_000;

export function PlotMapControls({
  onGoTo,
  disabled = false,
}: PlotMapControlsProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed || disabled || busy) return;

    setBusy(true);
    setError(null);
    const found = await searchAddress(trimmed);
    setBusy(false);

    if (!found) {
      setError("주소를 찾지 못했습니다. 시·군·면 단위로 입력해 보세요.");
      return;
    }

    onGoTo(found);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;

    // 이걸 빼면 Enter 가 바깥 등록 폼을 제출한다 — 아직 다 못 채웠는데.
    event.preventDefault();
    void runSearch();
  }

  function handleLocate() {
    if (disabled || busy) return;

    if (!navigator.geolocation) {
      setError("이 브라우저는 위치 기능을 지원하지 않습니다.");
      return;
    }

    setBusy(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        onGoTo({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setBusy(false);
        setError("현재 위치를 가져오지 못했습니다. 주소로 찾아 주세요.");
      },
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS },
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="plot-address-search">
          주소 검색
        </label>
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-fg text-sm placeholder:text-fg-subtle transition-colors hover:border-accent focus:border-accent"
          id="plot-address-search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="도로명·지번 주소로 찾기"
          type="search"
          value={query}
        />
        <button
          className="shrink-0 rounded-md border border-border-strong px-4 py-2.5 font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent disabled:opacity-50"
          disabled={disabled || busy}
          onClick={() => void runSearch()}
          type="button"
        >
          검색
        </button>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2.5 font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo hover:bg-accent-hover disabled:opacity-50"
          disabled={disabled || busy}
          onClick={handleLocate}
          type="button"
        >
          <MapPinIcon />
          현재 위치
        </button>
      </div>

      {error && <p className="text-unsuitable text-xs">{error}</p>}
    </div>
  );
}
