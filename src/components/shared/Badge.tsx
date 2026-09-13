import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 공용 배지 (상태 칩)
 *
 * [Description]
 * - 등급·상태·라벨을 한 단어로 붙이는 최소 단위. 카드 제목 옆, 표 셀 안, 목록 항목에 쓴다.
 * - 배경을 불투명 색면으로 채우지 않고 `/10` 투명도 + `/25` 테두리로 만든다.
 *   불투명 칩이 여러 개 놓이면 색면이 화면을 지배해서 정작 본문이 안 읽힌다.
 *   또 이 방식은 surface·space 어느 배경 위에 올려도 바탕색이 자연스럽게 비친다.
 * - 색만으로 상태를 구분하지 않는다. 텍스트가 항상 함께 있고, `dot` 은 보조 신호다.
 *   색각 이상 사용자에게 색은 정보가 아니다.
 *
 * [Usage]
 * ```tsx
 * <Badge tone="good" dot>적합</Badge>
 * <Badge tone="telemetry" size="sm" icon={<SatelliteIcon />}>관측 12분 전</Badge>
 * ```
 * ---------------------------------------------
 */

type Tone =
  | "neutral"
  | "good"
  | "caution"
  | "unsuitable"
  | "info"
  | "telemetry"
  | "accent";
type Size = "sm" | "md";

const TONE: Record<Tone, string> = {
  neutral: "text-fg-muted border-border bg-surface-2",
  good: "text-good border-good/25 bg-good/10",
  caution: "text-caution border-caution/25 bg-caution/10",
  unsuitable: "text-unsuitable border-unsuitable/25 bg-unsuitable/10",
  info: "text-info border-info/25 bg-info/10",
  telemetry: "text-telemetry border-telemetry/25 bg-telemetry/10",
  accent: "text-accent border-accent/25 bg-accent/10",
};

const SIZE: Record<Size, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-2.5 py-1 text-sm",
};

interface BadgeProps {
  tone?: Tone;
  size?: Size;
  icon?: ReactNode;
  /** 앞에 찍는 작은 원형 점. 아이콘 없이 상태만 보일 때 쓴다. */
  dot?: boolean;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  size = "md",
  icon,
  dot = false,
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${SIZE[size]} ${TONE[tone]}`}
    >
      {dot && (
        // bg-current 로 점 색을 글자색에 묶는다. tone 마다 점 색을 또 나열하면
        // 토큰이 한 벌 더 생겨서 나중에 반드시 어긋난다.
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      )}
      {icon}
      {children}
    </span>
  );
}
