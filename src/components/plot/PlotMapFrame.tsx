import { MapPinIcon, SatelliteIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";

/**
 * ---------------------------------------------
 * [Feature]: 밭 위치 지정 지도 자리 (레이아웃 전용)
 *
 * [Description]
 * - **지도 로직은 여기 없다.** 카카오맵 연결은 다른 사람이 맡기로 해서, 이
 *   컴포넌트는 지도가 들어갈 **자리와 주변 조작 UI 의 모양**만 잡는다.
 * - 연결하는 쪽이 찾아야 할 곳은 하나다 — `PLOT_MAP_CONTAINER_ID` 를 가진 `<div>`.
 *   크기가 이미 잡혀 있어 지도를 붙이면 바로 그 크기로 그려진다.
 *   (카카오맵은 컨테이너 높이가 0이면 아무것도 안 보인다.)
 * - **핀이 지도 한가운데 고정이다.** 스펙이 "지도를 이동해 중앙 핀으로 지정"이라
 *   핀을 찍어 옮기는 방식이 아니다. 밭이 작아 폴리곤이 아닌 **지점 좌표**만
 *   받으므로, 지도를 끌어 맞추는 쪽이 손가락으로도 정확하다.
 *   그래서 이 핀은 지도 위에 떠 있고 `pointer-events-none` 이라 드래그를 막지 않는다.
 * - 격자 무늬만 인라인 style 로 그린다. 배경 이미지는 유틸리티로 표현할 수 없는데,
 *   색은 `--border-c` **토큰을 참조**하므로 다크모드가 따라온다(값 하드코딩 아님).
 * - 검색창·현재 위치 버튼은 지도 **밖**에 둔다. 시안은 지도 위에 얹었는데,
 *   그러면 지도를 가리는 데다 모바일에서 밭을 맞출 자리를 뺏는다.
 *
 * [Usage]
 * ```tsx
 * <PlotMapFrame />
 *
 * // 연결하는 쪽(클라이언트 컴포넌트)에서:
 * const el = document.getElementById(PLOT_MAP_CONTAINER_ID);
 * const map = new kakao.maps.Map(el, { center: new kakao.maps.LatLng(36.4084, 128.1574), level: 4 });
 * kakao.maps.event.addListener(map, "idle", () => map.getCenter());  // 중앙이 곧 선택 좌표
 * ```
 * ---------------------------------------------
 */

/**
 * 지도 SDK 가 붙을 컨테이너의 DOM id.
 *
 * 문자열을 양쪽에 따로 적지 않도록 상수로 내보낸다. 연결하는 쪽은 이 값을
 * import 해서 쓰면 되고, 나중에 바꿔도 한 곳만 고치면 된다.
 */
export const PLOT_MAP_CONTAINER_ID = "plot-map-canvas";

export function PlotMapFrame() {
  return (
    <div className="flex flex-col gap-3">
      {/* ── 주소 검색 · 현재 위치 ─────────────────────
          아직 동작하지 않지만 `disabled` 를 걸지 않는다. 비활성 입력은 포커스를
          받지 못해 퍼블 단계에서 탭 순서를 확인할 수 없다. */}
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="plot-address-search">
          주소 검색
        </label>
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-fg text-sm placeholder:text-fg-subtle transition-colors hover:border-accent focus:border-accent"
          id="plot-address-search"
          name="addressQuery"
          placeholder="도로명·지번 주소로 찾기"
          type="search"
        />
        <button
          className="shrink-0 rounded-md border border-border-strong px-4 py-2.5 font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
          type="button"
        >
          검색
        </button>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2.5 font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo hover:bg-accent-hover"
          type="button"
        >
          <MapPinIcon />
          현재 위치
        </button>
      </div>

      {/* ── 지도 자리 ────────────────────────────────
          바깥 div 가 테두리·라운드·overflow 를 맡고, 안쪽 컨테이너가 지도 전용이다.
          둘을 합치면 지도가 모서리를 뚫고 나온다(카카오맵이 자식에 overflow 를 건다). */}
      <div className="relative overflow-hidden rounded-lg border-2 border-accent/30 bg-accent-subtle/40 shadow-e1">
        <div
          className="h-[20rem] w-full sm:h-[26rem]"
          id={PLOT_MAP_CONTAINER_ID}
          style={{
            backgroundImage:
              "linear-gradient(var(--border-c) 1px, transparent 1px), linear-gradient(90deg, var(--border-c) 1px, transparent 1px)",
            backgroundSize: "2rem 2rem",
          }}
        />

        {/* 중앙 고정 핀. 지도를 끌어도 여기 그대로 있고, 지도 중심이 곧 밭 위치다.
            pointer-events-none 이라 지도 드래그를 가로채지 않는다. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative grid place-items-center">
            {/* 십자선. 핀이 정확히 어디를 가리키는지 눈으로 맞출 수 있어야 한다. */}
            <span
              aria-hidden="true"
              className="absolute h-px w-16 bg-accent/35"
            />
            <span
              aria-hidden="true"
              className="absolute h-16 w-px bg-accent/35"
            />
            <span className="relative grid size-12 place-items-center rounded-full bg-accent text-xl text-accent-on shadow-e2">
              <span
                aria-hidden="true"
                className="absolute inset-0 animate-pulse-ring rounded-full bg-accent"
              />
              <MapPinIcon className="relative" />
            </span>
          </div>
        </div>

        {/* 조작 안내. 아래쪽이라 핀을 가리지 않는다. */}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-surface/90 px-3.5 py-1.5 text-center text-fg text-xs shadow-e1 backdrop-blur">
          지도를 움직여 밭을 한가운데 맞춰 주세요
        </p>

        {/* 연결 상태 표식. 퍼블 단계임을 화면에서 바로 알 수 있어야
            검토하는 사람이 "지도가 왜 안 뜨냐"고 묻지 않는다. */}
        <div className="absolute top-3 left-3">
          <Badge dot icon={<SatelliteIcon />} size="sm" tone="accent">
            지도 연결 예정
          </Badge>
        </div>
      </div>

      <p className="text-fg-subtle text-xs leading-relaxed">
        위치 권한을 거부하셔도 괜찮습니다. 주소 검색으로 찾으시면 됩니다.
      </p>
    </div>
  );
}
