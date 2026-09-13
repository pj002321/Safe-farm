"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/shared/hooks/useInView";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";

/**
 * ---------------------------------------------
 * [Feature]: 카운트업 지표
 *
 * [Description]
 * - 화면에 들어올 때 0 에서 목표값까지 올라간다. 숫자가 "계측되고 있다"는 인상을 준다.
 * - 시간 기준을 `Date.now()` 가 아니라 requestAnimationFrame 이 주는 timestamp 로 잡는다.
 *   rAF 는 탭이 백그라운드로 가면 호출이 멈추는데, 벽시계로 재면 돌아왔을 때 이미
 *   시간이 다 흘러 숫자가 툭 튄다. 프레임 시각을 쓰면 멈춘 지점부터 이어진다.
 * - 접근성: 올라가는 도중의 숫자는 의미가 없고, 스크린리더가 중간값을 반복해서 읽으면
 *   방해만 된다. 그래서 시각 노드는 aria-hidden 으로 감추고, 바깥 그룹의 aria-label 에
 *   최종 문자열을 한 번만 담는다.
 * - 모션 최소화 설정이면 애니메이션 없이 최종값을 바로 보여준다.
 *
 * [Usage]
 * ```tsx
 * <Stat value={98.6} decimals={1} suffix="%" label="관측 성공률" />
 * <Stat value={5} prefix="T-" label="다음 통과까지 (일)" />
 * ```
 * ---------------------------------------------
 */

/** 1.2초. 더 길면 스크롤을 계속하는 사용자가 끝을 못 본다. */
const DURATION_MS = 1200;

interface StatProps {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  /** 소수점 자리수. 기본 0(정수). */
  decimals?: number;
}

export function Stat({
  value,
  prefix = "",
  suffix = "",
  label,
  decimals = 0,
}: StatProps) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!inView) {
      return;
    }
    if (prefersReducedMotion) {
      setCurrent(value);
      return;
    }

    // 첫 프레임의 timestamp 를 기준점으로 삼는다. 바깥에서 미리 시각을 재면
    // 첫 프레임이 그려지기까지의 지연만큼 애니메이션이 잘린 채 시작한다.
    let frame = requestAnimationFrame((startedAt) => {
      const step = (timestamp: number) => {
        const progress = Math.min((timestamp - startedAt) / DURATION_MS, 1);
        // ease-out cubic. 처음 빠르고 끝에서 잦아들어야 "수렴"처럼 보인다.
        setCurrent(value * (1 - (1 - progress) ** 3));
        if (progress < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      step(startedAt);
    });

    return () => cancelAnimationFrame(frame);
  }, [inView, prefersReducedMotion, value]);

  const finalText = `${prefix}${value.toFixed(decimals)}${suffix}`;
  const currentText = `${prefix}${current.toFixed(decimals)}${suffix}`;

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      {/* 올라가는 도중의 숫자 대신 최종 문자열을 한 번만 읽힌다. div 에 aria-label 을
          거는 방법은 role 이 없는 요소에서 보조기기마다 무시돼 신뢰할 수 없다. */}
      <span className="sr-only">{`${label} ${finalText}`}</span>
      <span
        aria-hidden="true"
        className="font-mono font-semibold text-3xl tabular-nums md:text-4xl"
      >
        {currentText}
      </span>
      <span aria-hidden="true" className="text-fg-muted text-sm">
        {label}
      </span>
    </div>
  );
}
