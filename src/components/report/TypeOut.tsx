"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";

/**
 * ---------------------------------------------
 * [Feature]: 한 글자씩 찍히는 텍스트
 *
 * [Description]
 * - LLM 이 문장을 만들어내는 순간을 그대로 보여주기 위한 연출이다. 이 리포트의
 *   요점이 "앞 단계에서 숫자가 다 정해지고 마지막에 문장만 만들어진다"이므로,
 *   그 마지막 한 걸음이 눈에 보여야 한다.
 * - **전체 문장을 항상 DOM 에 둔다.** 보이는 부분만 렌더하면 스크린리더가 글자가
 *   늘어날 때마다 다시 읽어 소음이 된다. 그래서 `aria-hidden` 으로 감춘 애니메이션
 *   레이어와, 보조기기가 읽을 완성된 텍스트를 나눠 둔다.
 * - `prefers-reduced-motion` 이면 즉시 전체를 보여준다. 연출이지 콘텐츠가 아니다.
 * - 커서는 `::after` 가 아니라 실제 span 이다. 타이핑이 끝나면 사라져야 하는데
 *   가상 요소는 조건부로 지우기가 번거롭다.
 *
 * [Usage]
 * ```tsx
 * <TypeOut text="배추가 잘 크고 있어요." startDelayMs={200} />
 * ```
 * ---------------------------------------------
 */

interface TypeOutProps {
  text: string;
  /** 시작 전 지연(ms). 여러 줄을 순서대로 찍을 때 쓴다. */
  startDelayMs?: number;
  /** 글자당 간격(ms). 한글은 정보 밀도가 높아 라틴보다 느린 편이 읽기 좋다. */
  charMs?: number;
  className?: string;
  /** 타이핑이 끝났을 때. 다음 줄을 잇는 데 쓴다. */
  onDone?: () => void;
}

export function TypeOut({
  text,
  startDelayMs = 0,
  charMs = 22,
  className,
  onDone,
}: TypeOutProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(() => (reduceMotion ? text.length : 0));
  // onDone 을 effect 의존성에 넣으면 부모가 인라인 함수를 넘길 때마다
  // 타이핑이 처음부터 다시 시작된다. ref 로 최신 값만 들고 본다.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (reduceMotion) {
      setShown(text.length);
      onDoneRef.current?.();
      return;
    }

    setShown(0);
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      index += 1;
      setShown(index);
      if (index >= text.length) {
        onDoneRef.current?.();
        return;
      }
      timer = setTimeout(tick, charMs);
    };

    timer = setTimeout(tick, startDelayMs);
    return () => clearTimeout(timer);
  }, [text, charMs, startDelayMs, reduceMotion]);

  const done = shown >= text.length;

  return (
    <span className={className}>
      {/* 보조기기가 읽는 쪽. 항상 완성된 문장이라 글자가 늘어도 다시 읽지 않는다. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {!done && (
          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-accent align-baseline" />
        )}
      </span>
    </span>
  );
}
