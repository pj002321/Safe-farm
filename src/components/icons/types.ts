import type { SVGProps } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 아이콘 공통 타입 · 공통 SVG 속성
 *
 * [Description]
 * - 아이콘 40여 개가 같은 <svg> 속성 9줄을 각자 베껴 쓰면 한 곳만 어긋나도
 *   무게(stroke-width)나 정렬이 튄다. 그래서 속성을 여기 한 곳에 모아 둔다.
 * - 크기를 `1em` 으로 고정한 건 호출부가 `size-5` · `text-lg` 같은 기존
 *   유틸리티로 크기를 정하게 하려는 것이다. 아이콘마다 width prop 을 받지 않는다.
 * - `aria-hidden` 은 여기 넣지 않는다. 정적 분석(biome a11y/noSvgWithoutTitle)이
 *   스프레드 안을 못 보기 때문에 각 아이콘의 <svg> 에 직접 적는다.
 *
 * [Usage]
 * ```tsx
 * export function FooIcon(props: IconProps) {
 *   return (
 *     <svg {...ICON_BASE} aria-hidden="true" {...props}>
 *       <path d="M4 4h16" />
 *     </svg>
 *   );
 * }
 * ```
 * ---------------------------------------------
 */

/** 모든 아이콘의 prop. 호출부가 className·aria-label·onClick 을 그대로 넘길 수 있다. */
export type IconProps = SVGProps<SVGSVGElement>;

/**
 * 모든 아이콘이 공유하는 <svg> 속성.
 * `as const` 가 필요하다 — 없으면 strokeLinecap 이 string 으로 넓어져 타입이 깨진다.
 */
export const ICON_BASE = {
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  focusable: "false",
} as const;
