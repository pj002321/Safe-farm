import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 로딩 스켈레톤
 *
 * [Description]
 * - 스피너 대신 스켈레톤을 쓰는 이유는 **레이아웃이 튀지 않게** 하기 위해서다.
 *   가운데 도는 원 하나를 띄우면 내용이 도착하는 순간 화면이 통째로 재배치되어
 *   읽던 자리를 잃는다. 스켈레톤은 올 내용과 같은 크기의 자리를 미리 잡는다.
 * - **화면마다 모양이 달라야 한다.** 실제 화면과 닮지 않은 스켈레톤은 기다림을
 *   길게 느끼게 한다. 그래서 조각(`SkeletonLine`·`SkeletonCard`)만 제공하고
 *   조립은 각 `loading.tsx` 가 한다.
 * - `aria-hidden` 으로 감추고 바깥에 상태 문구를 둔다. 스크린리더에 회색 상자
 *   개수를 읽어 줄 이유가 없다 — 필요한 것은 "불러오는 중"이라는 한마디다.
 * - `animate-pulse` 는 Tailwind 기본 유틸리티다. globals.css 의 모션 토큰은
 *   전부 일회성·무한 반복 연출용이라 이 용도에 맞는 것이 없다.
 *   `prefers-reduced-motion` 은 globals.css 의 전역 규칙이 눌러 준다.
 *
 * [Usage]
 * ```tsx
 * <SkeletonScreen labelKo="대시보드를 불러오는 중입니다">
 *   <SkeletonLine className="h-8 w-48" />
 *   <SkeletonCard />
 * </SkeletonScreen>
 * ```
 * ---------------------------------------------
 */

/** 글자 한 줄 자리. 폭·높이는 호출부가 정한다. */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-2 ${className}`}
    />
  );
}

/** 카드 한 장 자리. 제목 한 줄 + 본문 두 줄. */
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <SkeletonLine className="h-4 w-2/5" />
      <SkeletonLine className="mt-3 h-3 w-full" />
      <SkeletonLine className="mt-2 h-3 w-4/5" />
    </div>
  );
}

/**
 * 스켈레톤 묶음.
 *
 * `<output>` 은 role="status" 를 기본으로 가진다. div+role 조합보다 보조기기
 * 지원이 넓고 biome 의 a11y/useSemanticElements 도 이쪽을 요구한다.
 * 알림은 여기 한 번만 — 조각마다 알리면 스크린리더가 같은 말을 여러 번 읽는다.
 */
export function SkeletonScreen({
  labelKo,
  children,
}: {
  labelKo: string;
  children: ReactNode;
}) {
  return (
    <output aria-live="polite" className="block">
      <span className="sr-only">{labelKo}</span>
      {children}
    </output>
  );
}
