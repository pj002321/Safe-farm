"use client";

import type { ElementType, ReactNode } from "react";
import { useInView } from "@/shared/hooks/useInView";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";

/**
 * ---------------------------------------------
 * [Feature]: 스크롤 등장 연출 래퍼
 *
 * [Description]
 * - 뷰포트에 들어올 때 아래에서 살짝 떠오르며 나타난다. 긴 랜딩 페이지에서 섹션의
 *   시작을 알리는 장치다. 장식이 목적이 아니라 읽는 순서를 만드는 것이 목적이므로,
 *   한 섹션 안의 항목들에 `delay` 를 20~80ms 씩 주는 정도로만 쓴다.
 * - **모션 최소화 설정이면 연출을 아예 건너뛴다.** globals.css 가 transition 시간을
 *   0.01ms 로 눌러주긴 하지만, 그건 "빨리 끝나는 애니메이션"일 뿐이다. 여기서는
 *   초기 상태 자체를 보이는 상태로 두어 어떤 움직임도 만들지 않는다.
 * - opacity-0 으로 시작하므로, IntersectionObserver 가 없는 환경에서 콘텐츠가 영영
 *   사라질 위험이 있다. 그 폴백은 useInView 가 책임진다(없으면 즉시 true).
 *
 * [Usage]
 * ```tsx
 * <Reveal as="section" delay={80} className="mt-24">
 *   <SectionHeading title="관측 파이프라인" />
 * </Reveal>
 * ```
 * ---------------------------------------------
 */

interface RevealProps {
  /** 렌더할 태그. 기본 div. 의미가 있는 영역이면 section·li 등을 넘긴다. */
  as?: ElementType;
  /** 등장 지연(ms). 목록을 순차로 띄울 때 쓴다. */
  delay?: number;
  className?: string;
  children: ReactNode;
}

export function Reveal({
  as,
  delay = 0,
  className = "",
  children,
}: RevealProps) {
  // ElementType 을 그대로 JSX 로 쓰면 ref·style 이 모든 태그의 교집합으로 좁혀져
  // 타입이 깨진다. 렌더 결과는 동일하므로 대표 intrinsic 태그로 좁혀서 쓴다.
  const Tag = (as ?? "div") as "div";
  const [ref, inView] = useInView<HTMLDivElement>();
  const prefersReducedMotion = usePrefersReducedMotion();

  const visible = prefersReducedMotion || inView;

  return (
    <Tag
      className={`transition-all duration-700 ease-out-expo ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
      ref={ref}
      style={
        prefersReducedMotion ? undefined : { transitionDelay: `${delay}ms` }
      }
    >
      {children}
    </Tag>
  );
}
