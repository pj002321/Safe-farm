import { ICON_BASE, type IconProps } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 브랜드 마크
 *
 * [Description]
 * - 제품의 두 축을 한 형태에 겹쳤다: 잎(작물)을 기울어진 궤도(위성)가 감싼다.
 *   둘을 나란히 놓는 대신 겹친 이유는 16px 파비콘 크기에서 나란한 두 도형은
 *   구분이 안 되기 때문이다.
 * - 다른 아이콘과 같은 currentColor 규칙을 지킨다. 다크 헤더에서는 text-space-fg,
 *   라이트 헤더에서는 text-fg 를 입히면 그대로 따라온다. 색을 박지 않는다.
 * - 정적 파비콘은 이 파일이 아니라 public/icon.svg 다. 그쪽은 React 가 없는
 *   환경이라 색을 하드코딩한다.
 *
 * [Usage]
 * ```tsx
 * <Logo className="size-8 text-accent" />
 * <LogoWordmark className="text-fg" />
 * ```
 * ---------------------------------------------
 */

/** 잎 실루엣을 기울어진 위성 궤도가 감싸는 정사각 브랜드 마크 */
export function Logo(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <ellipse cx="12" cy="13" rx="10" ry="4" transform="rotate(-20 12 13)" />
      <path d="M12 4.5a9 9 0 0 1 0 14 9 9 0 0 1 0-14Z" />
      <path d="M12 4.5v14" />
      <circle
        cx="19.61"
        cy="13.24"
        r="1.25"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * 마크 + 서비스명을 가로로 묶은 로고. 헤더·푸터처럼 이름이 함께 보여야 하는 곳에 쓴다.
 * 색을 지정하지 않으므로 부모의 text-* 를 그대로 상속한다.
 */
export function LogoWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo className="size-6 shrink-0" />
      <span className="font-semibold tracking-tight">Safe Farm AI</span>
    </span>
  );
}
