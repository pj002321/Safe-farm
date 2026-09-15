import { ICON_BASE, type IconProps } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 토지 아이콘
 *
 * [Description]
 * - 경작지·토양·지형처럼 "지표면"을 가리키는 네 개. 위성 아이콘이 하늘이라면
 *   이쪽은 땅이다.
 * - FieldIcon 은 일부러 원근(사다리꼴)을 넣었다. 정사각 격자로 그리면
 *   달력·표 아이콘과 구분이 안 된다.
 *
 * [Usage]
 * ```tsx
 * <FieldIcon className="size-5 text-earth" />
 * ```
 * ---------------------------------------------
 */

/** 원근이 들어간 사다리꼴 경작지와 소실점으로 모이는 이랑 */
export function FieldIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M2.5 19.5 8 6.5h8l5.5 13Z" />
      <path d="M10 6.5 7.25 19.5M12 6.5v13M14 6.5l2.75 13" />
    </svg>
  );
}

/** 토양 단면 3층과 위에서 뻗어 내려온 뿌리 */
export function SoilLayersIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <rect x="3" y="8" width="18" height="12.5" rx="1.5" />
      <path d="M3 12h18M3 16h18" />
      <path d="M12 4.5v13" />
      <path d="M12 9.5 8.5 12M12 13.5 15.5 16" />
    </svg>
  );
}

/** 지도 위 한 지점을 찍는 위치 핀 */
export function MapPinIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M19 10.5c0 5.25-7 11-7 11s-7-5.75-7-11a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </svg>
  );
}

/** 능선 2개와 그 사이를 가로지르는 등고선 (고도·지형) */
export function TerrainIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M2 19.5h20" />
      <path d="M4 19.5 9.5 10 15 19.5" />
      <path d="M12.5 19.5 16.5 12.5 21 19.5" />
      <path d="M7.2 14h4.6" />
    </svg>
  );
}

/** 세 폭으로 접힌 종이 지도. 하단 탭의 "지도"(지점이 아니라 지도 화면)에 쓴다. */
export function MapIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M2.5 6.2 9 4l6 2.2L21.5 4v13.8L15 20l-6-2.2-6.5 2.2z" />
      <path d="M9 4v13.8" />
      <path d="M15 6.2V20" />
    </svg>
  );
}
