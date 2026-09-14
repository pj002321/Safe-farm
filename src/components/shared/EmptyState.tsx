import type { ReactNode } from "react";
import { ButtonLink } from "@/components/shared/Button";

/**
 * ---------------------------------------------
 * [Feature]: 빈 상태
 *
 * [Description]
 * - 정의서가 **모든 목록형 화면에 "다음 행동을 제안하는" 빈 상태**를 요구한다.
 *   그래서 `actionKo`/`actionHref` 가 선택이 아니라 **필수**다. "데이터가 없습니다"
 *   만 띄우는 화면은 사용자를 막다른 길에 세운다 — 타입에서 그걸 못 만들게 한다.
 * - 비어 있는 이유를 함께 적는다. "아직 없음"과 "조건에 맞는 것이 없음"은
 *   사용자가 할 일이 다르다(만들기 vs 조건 바꾸기).
 * - 아이콘은 크게, 문구는 짧게. 빈 화면은 읽는 곳이 아니라 **다음 버튼을 찾는
 *   곳**이다.
 *
 * [Usage]
 * ```tsx
 * <EmptyState
 *   icon={<SproutIcon />}
 *   titleKo="아직 등록된 텃밭이 없습니다"
 *   bodyKo="밭 위치를 찍어 주시면 그 자리의 기상으로 할 일을 만들어 드립니다."
 *   actionKo="텃밭 등록하기"
 *   actionHref="/plots/new"
 * />
 * ```
 * ---------------------------------------------
 */

interface EmptyStateProps {
  icon: ReactNode;
  titleKo: string;
  bodyKo: string;
  /** 다음 행동. 정의서상 빠뜨릴 수 없어서 필수다. */
  actionKo: string;
  actionHref: string;
  /** 보조 행동. 없으면 그리지 않는다. */
  secondary?: ReactNode;
}

export function EmptyState({
  icon,
  titleKo,
  bodyKo,
  actionKo,
  actionHref,
  secondary,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-border border-dashed bg-surface-2/40 px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-subtle text-2xl text-accent">
        {icon}
      </span>

      <p className="mt-4 font-semibold text-fg text-lg">{titleKo}</p>
      <p className="mx-auto mt-2 max-w-md text-balance text-fg-muted text-sm leading-relaxed">
        {bodyKo}
      </p>

      <div className="mt-5 flex flex-col items-center gap-3">
        <ButtonLink href={actionHref} size="lg">
          {actionKo}
        </ButtonLink>
        {secondary}
      </div>
    </div>
  );
}
