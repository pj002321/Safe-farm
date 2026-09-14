"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * ---------------------------------------------
 * [Feature]: 단계 재생 (하나씩 쌓이는 타임라인)
 *
 * [Description]
 * - 정해진 개수의 단계를 일정 간격으로 하나씩 진행시킨다. "과정을 보여주는" 화면의
 *   공통 뼈대다.
 * - **`prefers-reduced-motion` 을 켠 사용자에게는 즉시 전부 보여준다.** 전정 장애나
 *   멀미가 있는 사용자에게 애니메이션은 접근성 문제이고, 이 화면에서 정보 자체를
 *   못 보게 막으면 그건 고장이다. 재생은 연출이지 콘텐츠가 아니다.
 * - 타이머를 `setTimeout` 체인으로 건다. `setInterval` 은 탭이 백그라운드로 가면
 *   브라우저가 호출을 몰아쳐서 단계가 한꺼번에 튀어나온다.
 * - 언마운트·재시작 때 반드시 타이머를 걷는다. 안 걷으면 이미 사라진 컴포넌트에
 *   setState 가 걸린다.
 *
 * [Usage]
 * ```tsx
 * const { completed, isPlaying, isDone, play, replay, skipToEnd } =
 *   useStepPlayback(TIMELINE.length, { stepMs: 900 });
 * ```
 * ---------------------------------------------
 */

export interface StepPlayback {
  /** 지금까지 끝난 단계 수(0 ~ total). */
  completed: number;
  isPlaying: boolean;
  isDone: boolean;
  /** 처음부터 재생. 이미 재생 중이면 아무 일도 하지 않는다. */
  play: () => void;
  /** 0 으로 되돌리고 다시 재생. */
  replay: () => void;
  /** 남은 단계를 건너뛰고 전부 표시. */
  skipToEnd: () => void;
}

export interface StepPlaybackOptions {
  /** 단계 사이 간격(ms). */
  stepMs?: number;
  /** 첫 단계까지의 지연(ms). 화면이 자리잡을 시간을 준다. */
  startDelayMs?: number;
  /** 마운트하자마자 시작할지. 기본 true. */
  autoPlay?: boolean;
}

export function useStepPlayback(
  total: number,
  options: StepPlaybackOptions = {},
): StepPlayback {
  const { stepMs = 900, startDelayMs = 400, autoPlay = true } = options;
  const reduceMotion = usePrefersReducedMotion();

  // reduceMotion 이 true 면 처음부터 전부 열어 둔다. 재생을 "빠르게" 하는 게
  // 아니라 아예 하지 않는다 — 빠른 애니메이션도 애니메이션이다.
  const [completed, setCompleted] = useState(() => (reduceMotion ? total : 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** 다음 단계를 예약한다. setTimeout 체인이라 백그라운드 탭에서도 몰리지 않는다. */
  const schedule = useCallback(
    (next: number, delay: number) => {
      clear();
      timer.current = setTimeout(() => {
        setCompleted(next);
        if (next >= total) {
          setIsPlaying(false);
          return;
        }
        schedule(next + 1, stepMs);
      }, delay);
    },
    [clear, stepMs, total],
  );

  const play = useCallback(() => {
    if (reduceMotion) {
      setCompleted(total);
      return;
    }
    setIsPlaying(true);
    setCompleted(0);
    schedule(1, startDelayMs);
  }, [reduceMotion, schedule, startDelayMs, total]);

  const replay = useCallback(() => {
    clear();
    play();
  }, [clear, play]);

  const skipToEnd = useCallback(() => {
    clear();
    setIsPlaying(false);
    setCompleted(total);
  }, [clear, total]);

  useEffect(() => {
    if (autoPlay && !reduceMotion) play();
    return clear;
    // play/clear 는 useCallback 으로 안정적이다. autoPlay 는 마운트 시점 값만 쓴다.
  }, [autoPlay, reduceMotion, play, clear]);

  return {
    completed,
    isPlaying,
    isDone: completed >= total,
    play,
    replay,
    skipToEnd,
  };
}
