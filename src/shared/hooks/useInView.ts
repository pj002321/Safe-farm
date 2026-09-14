"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 뷰포트 진입 감지 훅
 *
 * [Description]
 * - 스크롤 등장 연출(Reveal)·카운트업(Stat)이 공통으로 필요로 하는 "지금 보이는가"를
 *   한 곳에서만 계산한다. 컴포넌트마다 IntersectionObserver 를 새로 쓰면
 *   임계값·rootMargin 이 제각각이 되어 화면마다 등장 타이밍이 어긋난다.
 * - scroll 이벤트 + getBoundingClientRect 를 쓰지 않는 이유: 그 방식은 메인 스레드에서
 *   레이아웃을 강제로 재계산해 스크롤이 끊긴다. IntersectionObserver 는 브라우저가
 *   합성 스레드에서 처리한다.
 * - `once` 기본값이 true 인 것은 의도다. 등장 연출이 스크롤을 오르내릴 때마다
 *   반복되면 읽는 사람이 피로해진다. 반복이 필요한 경우만 false 로 끈다.
 *
 * [Usage]
 * ```tsx
 * const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });
 * return <div ref={ref}>{inView ? "보임" : "아직"}</div>;
 * ```
 * ---------------------------------------------
 */

interface UseInViewOptions {
  /** 요소가 이만큼 보이면 진입으로 친다(0~1). 기본 0.15 */
  threshold?: number;
  /** 한 번 보이면 관찰을 끊는다. 기본 true */
  once?: boolean;
  /** 관찰 영역 여백. 기본값은 화면 하단 10% 를 잘라 조금 늦게 트리거한다. */
  rootMargin?: string;
}

export function useInView<T extends Element>({
  threshold = 0.15,
  once = true,
  rootMargin = "0px 0px -10% 0px",
}: UseInViewOptions = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // 폴백이지 예외 은폐가 아니다. IntersectionObserver 가 없는 환경(구형 브라우저,
    // jsdom 없는 테스트 러너)에서 false 로 남겨두면 콘텐츠가 영영 opacity-0 으로
    // 사라진다. "연출을 못 하면 연출 없이 보여준다"가 올바른 열화 동작이다.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) {
              observer.disconnect();
            }
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return [ref, inView];
}
