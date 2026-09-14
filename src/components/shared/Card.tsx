import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 공용 카드
 *
 * [Description]
 * - 화면의 기본 구획 단위. surface/border 토큰만 쓰므로 다크모드가 자동으로 따라온다.
 * - `tone` 으로 강조 카드를 만든다. 도메인 의미(good/caution/unsuitable)는
 *   여기 넣지 않는다 — 그건 피쳐 컴포넌트의 몫이다.
 * - `glass` 는 어두운 히어로 위에 얹는 전용 톤이다. 밝은 배경 위에 쓰면 backdrop-blur 가
 *   할 일이 없어 그냥 반투명 카드로 보인다.
 * - `as` 를 두는 이유는 접근성이다. 랜드마크가 아닌 카드를 전부 `<section>` 으로 두면
 *   스크린리더의 영역 목록이 의미 없는 항목으로 가득 찬다. 제목 없는 카드는 `div`,
 *   독립적으로 읽히는 글은 `article` 을 쓴다. 기본값은 기존 동작 유지를 위해 section.
 *
 * [Usage]
 * ```tsx
 * <Card title="이번 주 예보" footer={<Button size="sm">새로고침</Button>}>
 *   내용
 * </Card>
 * <Card tone="glass" as="div" padding="lg" interactive>관측 요약</Card>
 * ```
 * ---------------------------------------------
 */

type Tone = "default" | "accent" | "telemetry" | "elevated" | "glass" | "night";
type Padding = "sm" | "md" | "lg";

const TONE: Record<Tone, string> = {
  default: "bg-surface border-border",
  accent: "bg-accent-subtle border-accent",
  telemetry: "bg-telemetry-subtle border-telemetry/30",
  elevated: "bg-surface border-border shadow-e2",
  glass: "bg-surface/60 backdrop-blur-xl border-space-border",
  // 밤하늘(bg-space) 위에 얹는 카드. **테마와 무관하게 항상 어둡다.**
  // glass 는 라이트 모드에서 흰 카드가 되는데, 히어로 지구본은 두 테마 모두
  // 어두우므로 그 위에서는 흰 카드가 떠 보이고 본문 대비도 뭉개진다.
  night:
    "bg-space/80 backdrop-blur-xl border-space-border text-space-fg shadow-e3",
};

const PADDING: Record<Padding, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

// transform 까지 트랜지션에 넣되 all 은 피한다. all 은 카드 안의 폭·높이 변화까지
// 애니메이션시켜서 내용이 바뀔 때 화면이 출렁인다.
const INTERACTIVE =
  "transition-[transform,border-color,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent hover:shadow-e2";

interface CardProps {
  title?: ReactNode;
  footer?: ReactNode;
  tone?: Tone;
  /** hover 시 살짝 떠오르며 강조된다. 카드 전체가 링크·버튼일 때만 켠다. */
  interactive?: boolean;
  padding?: Padding;
  as?: "section" | "article" | "div";
  children: ReactNode;
}

export function Card({
  title,
  footer,
  tone = "default",
  interactive = false,
  padding = "md",
  as = "section",
  children,
}: CardProps) {
  const Tag = as;

  return (
    <Tag
      className={`rounded-lg border ${PADDING[padding]} ${TONE[tone]}${
        interactive ? ` ${INTERACTIVE}` : ""
      }`}
    >
      {title && <h2 className="mb-2 font-semibold">{title}</h2>}
      <div className="text-sm">{children}</div>
      {footer && (
        <div className="mt-3 border-border border-t pt-3">{footer}</div>
      )}
    </Tag>
  );
}
