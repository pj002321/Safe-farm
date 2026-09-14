import { MapPinIcon, SatelliteIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";

/**
 * ---------------------------------------------
 * [Feature]: 밭 위치 선택 지도 자리 (레이아웃 전용)
 *
 * [Description]
 * - **지도 로직은 여기 없다.** 카카오맵 연결은 다른 사람이 맡기로 해서, 이 컴포넌트는
 *   지도가 들어갈 **자리와 주변 조작 UI(주소 검색·현재 위치)의 모양**만 잡는다.
 * - 연결하는 쪽이 찾아야 할 곳은 하나다 — `PLOT_MAP_CONTAINER_ID` 를 가진 `<div>`.
 *   그 div 는 크기가 이미 잡혀 있으므로 지도를 붙이면 바로 그 크기로 그려진다.
 *   (카카오맵은 컨테이너 높이가 0이면 아무것도 안 보인다. 그래서 여기서 높이를 준다.)
 * - 자리표시는 **비어 보이지 않게** 격자와 핀을 그려 둔다. 회색 네모만 두면
 *   "지도가 깨졌다"로 읽히고, 디자인 검토 때 이 영역의 크기감을 판단할 수 없다.
 * - 격자 무늬만 인라인 style 로 그린다. 배경 이미지는 유틸리티로 표현할 수 없는데,
 *   색은 `--border-c` **토큰을 그대로 참조**하므로 다크모드가 따라온다(값 하드코딩 아님).
 * - 검색창·현재 위치 버튼은 지도 **위에 떠 있지 않고 위아래로 분리**했다. 참고 시안은
 *   지도 위에 얹었는데, 그러면 지도를 가리는 데다 모바일에서 핀을 찍을 자리를 뺏는다.
 *
 * [Usage]
 * ```tsx
 * <PlotMapFrame />
 *
 * // 연결하는 쪽(클라이언트 컴포넌트)에서:
 * const el = document.getElementById(PLOT_MAP_CONTAINER_ID);
 * new kakao.maps.Map(el, { center: new kakao.maps.LatLng(36.4084, 128.1574), level: 5 });
 * ```
 * ---------------------------------------------
 */

/**
 * 지도 SDK 가 붙을 컨테이너의 DOM id.
 *
 * 문자열을 양쪽에 따로 적지 않도록 상수로 내보낸다. 연결하는 쪽은 이 값을 import 해서
 * 쓰면 되고, 나중에 id 를 바꿔도 한 곳만 고치면 된다.
 */
export const PLOT_MAP_CONTAINER_ID = "plot-map-canvas";

export function PlotMapFrame() {
  return (
    <div className="flex flex-col gap-3">
      {/* ── 주소 검색 ────────────────────────────────
          아직 동작하지 않지만 `disabled` 를 걸지 않는다. 비활성 입력은 스크린리더가
          건너뛰고 포커스도 받지 못해, 퍼블 단계에서 탭 순서를 확인할 수 없다.
          대신 아래 안내 문구가 "연결 전"임을 말한다. */}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="plot-address-search">
          주소 검색
        </label>
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-fg text-sm placeholder:text-fg-subtle transition-colors hover:border-accent focus:border-accent"
          id="plot-address-search"
          name="addressQuery"
          placeholder="주소로 찾기 (예: 경북 상주시 낙동면)"
          type="search"
        />
        <button
          className="shrink-0 rounded-md border border-border-strong px-4 py-2.5 font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
          type="button"
        >
          검색
        </button>
      </div>

      {/* ── 지도 자리 ────────────────────────────────
          바깥 div 가 테두리·라운드·overflow 를 맡고, 안쪽 컨테이너가 지도 전용이다.
          둘을 합치면 지도가 모서리를 뚫고 나온다(카카오맵이 자식에 overflow 를 건다). */}
      <div className="relative overflow-hidden rounded-lg border-2 border-accent/30 bg-accent-subtle/40 shadow-e1">
        <div
          className="h-[22rem] w-full sm:h-[27rem]"
          id={PLOT_MAP_CONTAINER_ID}
          // 색은 토큰 참조다. 격자 무늬는 유틸리티로 표현할 수 없어 여기서만 그린다.
          style={{
            backgroundImage:
              "linear-gradient(var(--border-c) 1px, transparent 1px), linear-gradient(90deg, var(--border-c) 1px, transparent 1px)",
            backgroundSize: "2rem 2rem",
          }}
        />

        {/* 자리표시 오버레이. 지도가 붙으면 연결하는 쪽에서 이 블록을 지운다.
            pointer-events-none 이라 지도를 먼저 붙여도 클릭을 가로채지 않는다. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <span className="relative grid size-14 place-items-center rounded-full bg-accent text-2xl text-accent-on shadow-e2">
            {/* 뒤로 퍼지는 링. 이 화면에서 가장 먼저 해야 할 일이 "지도 찍기"라는 걸
                움직임으로 알린다. prefers-reduced-motion 은 globals.css 가 눌러 준다. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-pulse-ring rounded-full bg-accent"
            />
            <MapPinIcon className="relative" />
          </span>
          <div>
            <p className="font-semibold text-fg text-sm">
              지도를 눌러 밭 위치를 찍습니다
            </p>
            <p className="mt-1 text-fg-muted text-xs">
              핀을 옮기면 선택된 위치가 함께 바뀝니다
            </p>
          </div>
        </div>

        {/* 연결 상태 표식. 퍼블 단계임을 화면에서 바로 알 수 있어야
            검토하는 사람이 "지도가 왜 안 뜨냐"고 묻지 않는다. */}
        <div className="absolute top-3 left-3">
          <Badge dot icon={<SatelliteIcon />} size="sm" tone="accent">
            지도 연결 예정
          </Badge>
        </div>
      </div>

      {/* ── 지도 아래 보조 조작 ───────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg-subtle text-xs">
          지도를 직접 눌러도 그 지점이 선택됩니다.
        </p>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 font-medium text-fg text-xs transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
          type="button"
        >
          <MapPinIcon />
          현재 위치로
        </button>
      </div>
    </div>
  );
}
