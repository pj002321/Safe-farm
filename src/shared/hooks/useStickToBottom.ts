"use client";

import { type RefObject, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * ---------------------------------------------
 * [Feature]: 새 내용이 쌓이면 아래로 따라가는 스크롤
 *
 * [Description]
 * - 항목이 하나씩 추가되는 패널(로그·추적·대화)에서 방금 생긴 것이 화면 밖으로
 *   밀려나지 않게 한다. 안 하면 사용자가 매번 직접 내려야 하고, 자동 재생 중에는
 *   따라잡을 수조차 없다.
 * - **사용자가 위로 올리면 따라가기를 멈춘다.** 지난 단계를 다시 읽는 중인데
 *   화면이 계속 아래로 끌려가면 읽을 수가 없다. 다시 바닥 근처로 내려오면
 *   자동으로 재개한다 — 채팅 앱이 쓰는 방식과 같다.
 * - 컨테이너가 스크롤 가능하지 않으면(좁은 화면에서 높이 제한을 풀어 둔 경우)
 *   `scrollTo` 는 아무 일도 하지 않는다. 페이지 전체가 끌려가지 않으므로
 *   모바일에서 화면이 멋대로 튀는 일이 없다.
 * - `prefers-reduced-motion` 이면 부드러운 스크롤 대신 즉시 이동한다.
 *
 * [Usage]
 * ```tsx
 * const ref = useStickToBottom<HTMLDivElement>(completed);
 * <div ref={ref} className="overflow-y-auto">…</div>
 * ```
 * ---------------------------------------------
 */

/** 바닥에서 이만큼 안쪽이면 "붙어 있다"고 본다(px). */
const STICK_THRESHOLD_PX = 96;

export function useStickToBottom<T extends HTMLElement>(
  /** 이 값이 바뀔 때마다 따라간다. 보통 항목 개수. */
  trigger: unknown,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  // 상태가 아니라 ref 다. 이 값이 바뀌어도 다시 그릴 필요가 없고,
  // 스크롤 핸들러마다 리렌더가 일어나면 재생이 버벅인다.
  const sticking = useRef(true);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      sticking.current = gap < STICK_THRESHOLD_PX;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * `trigger` 는 본문에서 읽지 않고 **재실행 신호로만** 쓴다. 린터 제안대로
   * 의존성에서 빼면 이 effect 가 마운트 때 한 번만 돌아 새 항목을 영영 따라가지
   * 않는다 — 훅의 목적 자체가 사라진다. 자동 수정했으면 기능이 조용히 죽는다.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger 는 재실행 신호다 (위 주석 참고)
  useEffect(() => {
    const el = ref.current;
    if (!el || !sticking.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [trigger, reduceMotion]);

  return ref;
}
