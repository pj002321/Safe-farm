import { ICON_BASE, type IconProps } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 경보·계측 아이콘
 *
 * [Description]
 * - 자연재해 경보와 그 정도를 읽는 계기류. 색은 여기서 정하지 않는다 —
 *   등급(good/caution/unsuitable)은 호출부가 토큰 유틸리티로 입힌다.
 *   아이콘이 색을 품으면 같은 모양을 등급별로 또 만들게 된다.
 *
 * [Usage]
 * ```tsx
 * <AlertTriangleIcon className="size-5 text-caution" />
 * ```
 * ---------------------------------------------
 */

/** 모서리가 둥근 삼각형 안의 느낌표 (위험 경고) */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M10.29 4.2 2.6 17.5a2 2 0 0 0 1.71 3h15.38a2 2 0 0 0 1.71-3L13.71 4.2a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** 방패 안의 체크 (위험 없음·안전 확인) */
export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 2.5 4 5.5v6.2c0 4.8 3.3 8.3 8 9.8 4.7-1.5 8-5 8-9.8V5.5Z" />
      <path d="M8.75 11.9 11.15 14.3 15.5 9.6" />
    </svg>
  );
}

/** 반구형 경광등과 좌우 위로 퍼지는 빛 (긴급 재해 알림) */
export function SirenIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M7.5 14.5a4.5 4.5 0 0 1 9 0" />
      <path d="M6 14.5h12v3.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18Z" />
      <path d="M12 8V6M7.8 10.3 6.3 8.8M16.2 10.3l1.5-1.5" />
    </svg>
  );
}

/** 반원 눈금판 위를 가리키는 바늘 (위험도·적합도 계기) */
export function GaugeIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3.5 17.5a8.5 8.5 0 0 1 17 0" />
      <path d="M4.64 13.25 6.37 14.25M12 9v2M19.36 13.25 17.63 14.25" />
      <path d="M12 17.5 15.6 11.27" />
      <circle cx="12" cy="17.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 축과 그 위를 지나는 추세선, 끝점 표시 (시계열 관측값) */
export function ChartLineIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3.5 3.5v15a2 2 0 0 0 2 2h15" />
      <path d="M7.5 16.5 11 12l3 2.5 5.5-7" />
      <circle cx="19.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
