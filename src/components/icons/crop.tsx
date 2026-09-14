import { ICON_BASE, type IconProps } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 작물 아이콘
 *
 * [Description]
 * - 재배 대상과 재배 행위를 나타내는 다섯 개. 강조색 leaf(작물) 쪽 언어다.
 * - 잎 실루엣은 원호 대신 3차 베지에로 그렸다. 원호로 그리면 끝이 뾰족하지 않아
 *   잎이 아니라 렌즈처럼 보인다.
 *
 * [Usage]
 * ```tsx
 * <SproutIcon className="size-5 text-accent" />
 * ```
 * ---------------------------------------------
 */

/** 흙선 위로 올라온 줄기와 좌우로 벌어진 떡잎 2장 */
export function SproutIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 20.5V12" />
      <path d="M12 13c-3.5 0-5.5-2-5.5-5.5 3.5 0 5.5 2 5.5 5.5Z" />
      <path d="M12 15c0-3.5 2-5.5 5.5-5.5 0 3.5-2 5.5-5.5 5.5Z" />
      <path d="M4.5 20.5h15" />
    </svg>
  );
}

/** 잎맥이 그려진 잎 한 장과 잎자루 */
export function LeafIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M20.5 3.5c0 9-6 15-15 15.5-.5-9 5.5-15 15-15.5Z" />
      <path d="M5.5 19 20.5 3.5" />
      <path d="M5.5 19 3 21.5" />
    </svg>
  );
}

/** 수확물을 담는 바구니와 그 위로 솟은 잎 두 장 */
export function HarvestIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3.5 11h17l-2 9.5h-13Z" />
      <path d="M4.45 15.5h15.1" />
      <path d="M12 11c0-3.5 2.5-6 6-6.5.5 3.5-2 6-6 6.5Z" />
      <path d="M12 11c-3-.5-5-2.5-5-5 3 .5 5 2.5 5 5Z" />
    </svg>
  );
}

/** 재배 일정을 보는 달력 — 상단 고리 2개와 한 주 행 */
export function CalendarIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" />
    </svg>
  );
}

/** 물뿌리개와 살수구에서 떨어지는 물줄기 (관수) */
export function WateringIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M4 10.5h8.5v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M7 10.5V9a2.5 2.5 0 0 1 5 0v1.5" />
      <path d="M12.5 12 16.5 8.5" />
      <path d="M15.12 6.92 17.88 10.08" />
      <path d="M15.5 13v2M17.5 12.5v2.5M19.5 14v2" />
    </svg>
  );
}
