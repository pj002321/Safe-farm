"use client";

import { useSyncExternalStore } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 모션 최소화 선호 구독 훅
 *
 * [Description]
 * - globals.css 가 CSS 애니메이션·트랜지션은 이미 죽인다. 하지만 JS 로 값을 굴리는
 *   카운트업(Stat)이나 3D 씬은 CSS 가 손대지 못한다. 그쪽에서 읽으라고 두는 훅이다.
 * - `useSyncExternalStore` 를 쓴 이유: useState+useEffect 로 하면 첫 렌더는 항상
 *   false 로 칠해진 뒤 한 프레임 늦게 true 가 되어, 모션을 끈 사용자가 애니메이션
 *   첫 프레임을 보게 된다. 이 훅은 하이드레이션 직후 값이 맞다.
 * - 설정 변경(OS 접근성 토글)도 즉시 반영된다. 새로고침을 요구하지 않는다.
 *
 * [Usage]
 * ```tsx
 * const reduced = usePrefersReducedMotion();
 * if (reduced) return <span>{finalValue}</span>;
 * ```
 * ---------------------------------------------
 */

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/** matchMedia 가 없는 환경(SSR·구형)에서는 구독할 대상이 없으므로 빈 해제 함수만 준다. */
function subscribe(onStoreChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(REDUCE_QUERY).matches;
}

/** 서버에는 사용자 설정이 없다. 모션 있음(false)으로 그려야 하이드레이션이 어긋나지 않는다. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
