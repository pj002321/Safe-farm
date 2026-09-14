import type { Metadata } from "next";
import { UserIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 내 정보  →  /me
 *
 * [Description]
 * - 하단 탭 다섯 개 중 하나. **아직 내용이 없는 화면**이라 빈 상태만 둔다.
 *   탭은 있는데 경로가 없으면 404 가 나므로, 자리를 먼저 만들고 "다음 행동"을
 *   제안한다(정의서의 빈 상태 규칙).
 * - 내용이 붙으면 이 파일의 EmptyState 를 목록으로 바꾸고, 비었을 때만
 *   같은 EmptyState 를 남긴다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "내 정보" };

export default function Page() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading description="계정과 알림 설정입니다." title="내 정보" />
      <EmptyState
        actionHref="/dashboard"
        actionKo="대시보드로"
        bodyKo="지금은 대시보드에서 로그아웃하실 수 있습니다. 알림 설정과 재배 기록이 이 자리에 들어옵니다."
        icon={<UserIcon />}
        titleKo="계정 설정은 준비 중입니다"
      />
    </main>
  );
}
