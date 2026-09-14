import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 섹션 제목 블록 (eyebrow + 제목 + 설명)
 *
 * [Description]
 * - 랜딩의 모든 섹션이 같은 리듬으로 시작하게 만드는 장치다. 섹션마다 h2 크기와
 *   여백을 손으로 정하면 스크롤할 때 계단이 어긋나 보인다.
 * - eyebrow 는 관제 화면의 채널 라벨을 흉내 낸 것이다. font-mono + 넓은 자간 + 짧은
 *   가로선. 이 조합이 "계측 데이터"라는 인상의 대부분을 만든다.
 * - 서버 컴포넌트다. 상태도 이벤트도 없으므로 클라이언트 번들에 넣을 이유가 없다.
 *
 * [Usage]
 * ```tsx
 * <SectionHeading
 *   eyebrow="observation"
 *   title="위성이 먼저 보고, 그다음 알려드립니다"
 *   description="Sentinel-2 관측을 5일 주기로 받아 필지 단위 생육 지수를 계산합니다."
 * />
 * ```
 * ---------------------------------------------
 */

interface SectionHeadingProps {
  /** 제목 위 한 줄짜리 계측 라벨. 영문 소문자로 넣어도 대문자로 그려진다. */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** "space" 는 어두운 히어로 위에 올릴 때. 밝은 배경에 쓰면 글자가 안 보인다. */
  tone?: "default" | "space";
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  tone = "default",
}: SectionHeadingProps) {
  const centered = align === "center";
  const isSpace = tone === "space";

  return (
    <div
      className={`flex flex-col gap-4 ${centered ? "items-center text-center" : "items-start"}`}
    >
      {eyebrow && (
        <p
          className={`flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] ${
            // 라이트 모드의 --telemetry 는 짙은 올리브다. 밤하늘 위에 올리면 명암비가
            // 3:1 도 안 나온다. 히어로는 양쪽 모드에서 항상 어두우므로 space-muted 를 쓴다.
            isSpace ? "text-space-muted" : "text-telemetry"
          }`}
        >
          <span aria-hidden="true" className="h-px w-6 bg-current" />
          {eyebrow}
        </p>
      )}

      <h2
        className={`text-balance font-semibold text-3xl tracking-tight sm:text-4xl md:text-display ${
          isSpace ? "text-space-fg" : "text-fg"
        }`}
      >
        {title}
      </h2>

      {description && (
        <p
          className={`max-w-2xl text-pretty text-base sm:text-lg ${
            isSpace ? "text-space-muted" : "text-fg-muted"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
