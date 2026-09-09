import type { ComponentProps } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 공용 버튼
 *
 * [Description]
 * - 색·간격은 전부 globals.css 의 시맨틱 토큰에서 온다. 하드코딩 금지.
 *   원시 팔레트(`--leaf-*`)를 직접 쓰면 다크모드가 깨진다.
 * - variant 를 문자열 유니온으로 좁혀서, 없는 값을 쓰면 컴파일 에러가 나게 한다.
 * - clsx/cva 같은 의존성을 쓰지 않는다. 문자열 join 하나에 패키지를 더할 이유가 없다.
 *
 * [Usage]
 * ```tsx
 * <Button>등록</Button>
 * <Button variant="danger" size="sm">삭제</Button>
 * <Button variant="ghost" type="button" onClick={...}>취소</Button>
 * ```
 * ---------------------------------------------
 */

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:opacity-90",
  secondary: "bg-surface text-fg border border-border hover:bg-accent-subtle",
  danger: "bg-unsuitable text-bg hover:opacity-90",
  ghost: "text-fg-muted underline hover:text-fg",
};

const SIZE: Record<Size, string> = {
  sm: "px-2 py-1 text-sm",
  md: "px-4 py-2",
};

interface ButtonProps extends Omit<ComponentProps<"button">, "className"> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: type 은 prop 기본값으로 항상 지정된다
      type={type}
      className={`rounded-md transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]}`}
      {...props}
    />
  );
}
