/**
 * ---------------------------------------------
 * [Feature]: 추적 패널의 코드·응답 블록
 *
 * [Description]
 * - API 응답과 계산 과정을 고정폭으로 그대로 보여준다. 이 화면의 신뢰는 "원본을
 *   가공하지 않고 보여준다"에서 나오므로 줄바꿈과 정렬을 건드리지 않는다.
 * - **`dangerouslySetInnerHTML` 을 쓰지 않는다.** 출처 PoC 는 색칠을 위해 HTML 을
 *   문자열로 조립했는데, 그 방식은 나중에 이 블록에 사용자 입력(일지 내용 등)이
 *   섞이는 순간 그대로 XSS 가 된다. 여기서는 정규식으로 토큰을 잘라 span 으로
 *   렌더한다 — 색은 조금 덜 화려해도 주입이 원천적으로 불가능하다.
 * - 색칠 대상은 **숫자와 화살표**뿐이다. 키워드까지 칠하면 언어가 섞인 이 블록에서
 *   오히려 산만해진다. 숫자가 이 화면의 주인공이라 그것만 살린다.
 *
 * [Usage]
 * ```tsx
 * <CodeBlock captionKo="하루치 적산온도" text={"dailyGdd(28.8, 15.0, 5) = 16.9"} />
 * ```
 * ---------------------------------------------
 */

/** 숫자(단위 포함)와 화살표를 잡는다. 나머지는 기본색으로 둔다. */
const TOKEN = /(→|←|-?\d+(?:\.\d+)?(?:mm|GDD|℃|%|m\/s|m|h|일)?)/g;

interface CodeBlockProps {
  text: string;
  captionKo?: string;
}

export function CodeBlock({ text, captionKo }: CodeBlockProps) {
  return (
    <div className="min-w-0">
      {captionKo && (
        <p className="mb-1.5 font-mono text-[0.7rem] text-space-muted">
          # {captionKo}
        </p>
      )}
      {/* 가로 스크롤은 이 블록 안에서만. 페이지 본문이 옆으로 밀리면 안 된다. */}
      <pre className="overflow-x-auto rounded-lg border border-space-border bg-black/30 px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed text-space-fg/85">
        <code>{highlight(text)}</code>
      </pre>
    </div>
  );
}

/** 문자열을 토큰 단위로 잘라 span 배열로 만든다. HTML 조립이 아니라 React 요소다. */
function highlight(text: string) {
  const parts = text.split(TOKEN);
  return parts.map((part, index) => {
    if (!part) return null;
    // key 에 index 를 쓰는 건 이 배열이 절대 재정렬되지 않기 때문이다
    // (같은 문자열을 매번 같은 순서로 자른다).
    const key = `${index}-${part}`;

    if (part === "→" || part === "←") {
      return (
        <span className="text-accent" key={key}>
          {part}
        </span>
      );
    }
    if (/^-?\d/.test(part)) {
      return (
        <span className="text-telemetry tabular-nums" key={key}>
          {part}
        </span>
      );
    }
    return <span key={key}>{part}</span>;
  });
}
