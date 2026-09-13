import { ICON_BASE, type IconProps } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 위성·관측 아이콘
 *
 * [Description]
 * - 제품의 1차 도메인인 "궤도에서 내려다본 관측"을 표현하는 다섯 개.
 * - 전부 24x24 그리드에 2px 여백을 두고 그렸고, 선 굵기 1.5 아웃라인으로
 *   시각적 무게를 맞췄다. 색은 currentColor 뿐이라 text-telemetry 같은
 *   토큰 유틸리티를 그대로 받는다.
 *
 * [Usage]
 * ```tsx
 * <SatelliteIcon className="size-5 text-telemetry" />
 * ```
 * ---------------------------------------------
 */

/** 본체 + 좌우 태양전지판 + 상단 파라볼라 안테나가 달린 관측 위성 */
export function SatelliteIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <rect x="9.5" y="9" width="5" height="6" rx="1" />
      <rect x="2.5" y="10" width="5" height="4" rx="0.5" />
      <rect x="16.5" y="10" width="5" height="4" rx="0.5" />
      <path d="M7.5 12h2M14.5 12h2M5 10v4M19 10v4" />
      <path d="M12 9V6" />
      <path d="M9.5 6a2.5 2.5 0 0 1 5 0" />
    </svg>
  );
}

/** 구체(지구)와 그 둘레를 기울어진 타원으로 도는 궤도, 궤도 위의 위성 점 */
export function OrbitIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)" />
      <circle cx="20.66" cy="7" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * 좌하단을 원점으로 한 사분면 스캔 화면 + 동심원 호 + 회전 빔 + 표적 점.
 * 중심 대칭으로 그리면 SignalIcon 과 구분이 되지 않아 원점을 모서리로 옮겼다.
 */
export function RadarIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3 3v17.5h17.5A17.5 17.5 0 0 0 3 3Z" />
      <path d="M13 20.5A10 10 0 0 0 3 10.5" />
      <path d="M3 20.5 13.04 6.16" />
      <circle
        cx="14.69"
        cy="13.75"
        r="1.25"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** 한 점에서 위로 퍼져 나가는 전파 호 3개 (지상 수신 신호) */
export function SignalIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M9.17 16.17a4 4 0 0 1 5.66 0" />
      <path d="M6.34 13.34a8 8 0 0 1 11.32 0" />
      <path d="M3.51 10.51a12 12 0 0 1 16.98 0" />
      <circle cx="12" cy="19" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * 비스듬히 기울어진 접시 림 + 급전부 + 기둥/받침 (지상국).
 * 접시를 호와 현으로 그리면 잎으로 읽혀서, 기울인 타원 림으로 그린다.
 */
export function GroundStationIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <ellipse cx="11" cy="9" rx="7.5" ry="4" transform="rotate(40 11 9)" />
      <path d="M11 9 14.54 4.79" />
      <circle cx="14.54" cy="4.79" r="1" fill="currentColor" stroke="none" />
      <path d="M11 13.8v6.7" />
      <path d="M7.5 20.5h7" />
    </svg>
  );
}
