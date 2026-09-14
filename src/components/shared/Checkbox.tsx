"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { CheckIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 공용 체크박스
 *
 * [Description]
 * - **네이티브 `<input type="checkbox">` 를 지우지 않는다.** 보이지 않게 덮되
 *   실제로 존재하므로 키보드(Space), 스크린리더, 폼 제출, `required` 검증,
 *   음성 제어가 전부 공짜로 따라온다. div 로 흉내 낸 체크박스는 이걸 전부
 *   직접 구현해야 하고 대부분 빠뜨린다.
 * - 체크 표시는 `peer-checked:` 로 그린다. 상태를 JS 로 들고 있지 않아도 되므로
 *   제어·비제어 양쪽에서 똑같이 동작한다.
 * - 포커스 링은 입력이 아니라 **보이는 상자**에 옮겨 준다. 입력이 시각적으로
 *   숨겨져 있어 링이 엉뚱한 곳에 뜨기 때문이다(`peer-focus-visible:`).
 * - `description` 은 `aria-describedby` 로 연결한다. 라벨에 다 욱여넣으면
 *   스크린리더가 체크박스 이름으로 문단 전체를 읽는다.
 *
 * [Usage]
 * ```tsx
 * <Checkbox name="terms" required label="이용약관에 동의합니다" badge="필수">
 *   수집 항목과 이용 목적을 적은 본문
 * </Checkbox>
 * ```
 * ---------------------------------------------
 */

interface CheckboxProps
  extends Omit<ComponentProps<"input">, "type" | "className" | "children"> {
  label: ReactNode;
  /** 라벨 옆 작은 표식. "필수" / "선택" 구분에 쓴다. */
  badge?: string;
  /** 라벨 아래 보조 설명. 접기 UI 가 필요하면 children 에 넣는다. */
  description?: ReactNode;
  /** 라벨 아래 임의 영역(약관 전문 접기 등). */
  children?: ReactNode;
}

export function Checkbox({
  label,
  badge,
  description,
  children,
  ...inputProps
}: CheckboxProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2.5">
        <input
          aria-describedby={descriptionId}
          className="peer sr-only"
          id={id}
          type="checkbox"
          {...inputProps}
        />

        <label
          className="mt-0.5 flex size-[1.125rem] shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border-strong bg-surface text-transparent transition-colors duration-150 ease-out-expo peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-on peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
          htmlFor={id}
        >
          <CheckIcon className="size-3" strokeWidth={3} />
        </label>

        <label
          className="cursor-pointer select-none text-fg text-sm leading-relaxed peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
          htmlFor={id}
        >
          {label}
          {badge && (
            <span
              className={`ml-1.5 font-mono text-[0.6875rem] ${
                badge === "필수" ? "text-accent" : "text-fg-subtle"
              }`}
            >
              ({badge})
            </span>
          )}
        </label>
      </div>

      {description && (
        <p className="pl-[1.75rem] text-fg-muted text-xs" id={descriptionId}>
          {description}
        </p>
      )}

      {children && <div className="pl-[1.75rem]">{children}</div>}
    </div>
  );
}
