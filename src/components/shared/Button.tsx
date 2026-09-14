import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoaderIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 공용 버튼 · 버튼형 링크
 *
 * [Description]
 * - 색·간격은 전부 globals.css 의 시맨틱 토큰에서 온다. 하드코딩 금지.
 *   원시 팔레트(`--orbit-*`)를 직접 쓰면 다크모드가 깨진다.
 * - variant 를 문자열 유니온으로 좁혀서, 없는 값을 쓰면 컴파일 에러가 나게 한다.
 * - clsx/cva 같은 의존성을 쓰지 않는다. 문자열 join 하나에 패키지를 더할 이유가 없다.
 * - **포커스 링을 여기서 정의하지 않는다.** globals.css 의 `:focus-visible` 규칙이
 *   전역에서 한 번만 그린다. 컴포넌트마다 다시 쓰면 두 겹으로 겹치거나 어긋난다.
 * - 버튼과 링크는 역할이 다르다(동작 vs 이동). 그래서 `<button>` 에 onClick 으로
 *   router.push 를 거는 대신 `ButtonLink` 를 따로 둔다 — 새 탭 열기·주소 복사 같은
 *   브라우저 기본 동작은 `<a>` 만 준다. 시각 스타일은 `buttonStyles()` 로 공유한다.
 *
 * [Usage]
 * ```tsx
 * <Button>등록</Button>
 * <Button variant="danger" size="sm">삭제</Button>
 * <Button variant="telemetry" loading>분석 중</Button>
 * <ButtonLink href="/login" variant="outline" iconEnd={<ArrowRightIcon />}>시작하기</ButtonLink>
 * ```
 * ---------------------------------------------
 */

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "telemetry"
  | "outline";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  // hover 를 opacity 대신 accent-hover 토큰으로 바꿨다. opacity 는 버튼 아래 배경을
  // 비쳐 보이게 해 히어로(어두운 space) 위에서 색이 탁해진다. 토큰은 배경과 무관하다.
  primary: "bg-accent text-accent-on hover:bg-accent-hover",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2",
  // 기존 ghost 는 상시 underline 이었다. 밑줄은 링크의 기호이지 버튼의 기호가 아니고,
  // 툴바에 여러 개 놓으면 화면이 지저분해진다. 밑줄을 빼되 hover 배경으로
  // "누를 수 있다"는 어포던스를 남긴다.
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-unsuitable text-accent-on hover:opacity-90",
  telemetry: "bg-telemetry-subtle text-telemetry border border-telemetry/30",
  outline:
    "border border-border-strong text-fg hover:border-accent hover:text-accent",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

// transition-colors 만으로는 danger 의 hover:opacity-90 이 뚝 끊긴다.
// 실제로 변하는 속성만 열거해 all 로 넓히지 않는다(레이아웃 속성까지 타면 버벅인다).
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[color,background-color,border-color,opacity] duration-200 ease-out-expo disabled:cursor-not-allowed disabled:opacity-50";

/** Button 과 ButtonLink 가 같은 문자열을 보게 하는 단일 출처. */
function buttonStyles(
  variant: Variant,
  size: Size,
  fullWidth: boolean,
): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}${fullWidth ? " w-full" : ""}`;
}

interface ButtonVisualProps {
  variant?: Variant;
  size?: Size;
  /** 글자 왼쪽 아이콘. loading 중에는 스피너로 대체된다. */
  icon?: ReactNode;
  /** 글자 오른쪽 아이콘. 주로 화살표 같은 진행 기호. */
  iconEnd?: ReactNode;
  fullWidth?: boolean;
}

interface ButtonProps
  extends ButtonVisualProps,
    Omit<ComponentProps<"button">, "className"> {
  /** 제출 대기 상태. 자동으로 disabled + aria-busy 가 된다. */
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  icon,
  iconEnd,
  fullWidth = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, size, fullWidth)}
      // 연타로 같은 요청이 두 번 나가는 것을 막는다. 시각적 disabled 와 한 몸이어야 한다.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderIcon className="animate-spin" /> : icon}
      {children}
      {iconEnd}
    </button>
  );
}

interface ButtonLinkProps
  extends ButtonVisualProps,
    Omit<ComponentProps<typeof Link>, "className"> {}

/**
 * next/link 를 Button 과 같은 옷으로 감싼다.
 * disabled·loading 을 받지 않는 것은 의도다 — `<a>` 는 비활성화할 수 없고,
 * pointer-events 로 흉내 내면 키보드 사용자에게는 여전히 눌린다.
 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  fullWidth = false,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonStyles(variant, size, fullWidth)} {...props}>
      {icon}
      {children}
      {iconEnd}
    </Link>
  );
}
