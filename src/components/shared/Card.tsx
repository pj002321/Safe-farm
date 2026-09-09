import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 공용 카드
 *
 * [Description]
 * - 화면의 기본 구획 단위. surface/border 토큰만 쓰므로 다크모드가 자동으로 따라온다.
 * - `tone` 으로 강조 카드를 만든다. 도메인 의미(good/caution/unsuitable)는
 *   여기 넣지 않는다 — 그건 피쳐 컴포넌트의 몫이다.
 *
 * [Usage]
 * ```tsx
 * <Card title="이번 주 예보" footer={<Button size="sm">새로고침</Button>}>
 *   내용
 * </Card>
 * ```
 * ---------------------------------------------
 */

type Tone = "default" | "accent";

const TONE: Record<Tone, string> = {
  default: "bg-surface border-border",
  accent: "bg-accent-subtle border-accent",
};

interface CardProps {
  title?: ReactNode;
  footer?: ReactNode;
  tone?: Tone;
  children: ReactNode;
}

export function Card({ title, footer, tone = "default", children }: CardProps) {
  return (
    <section className={`rounded-lg border p-4 ${TONE[tone]}`}>
      {title && <h2 className="mb-2 font-semibold">{title}</h2>}
      <div className="text-sm">{children}</div>
      {footer && (
        <div className="mt-3 border-border border-t pt-3">{footer}</div>
      )}
    </section>
  );
}
