import type { Metadata } from "next";
import { QuestionIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 질문  →  /ask
 *
 * [Description]
 * - 하단 탭 다섯 개 중 하나. **아직 내용이 없는 화면**이라 빈 상태만 둔다.
 *   탭은 있는데 경로가 없으면 404 가 나므로, 자리를 먼저 만들고 "다음 행동"을
 *   제안한다(정의서의 빈 상태 규칙).
 * - 내용이 붙으면 이 파일의 EmptyState 를 목록으로 바꾸고, 비었을 때만
 *   같은 EmptyState 를 남긴다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "질문" };

export default function Page() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="재배 중 궁금한 것을 물어보는 곳입니다."
        title="질문"
      />
      <EmptyState
        actionHref="/report"
        actionKo="오늘 리포트 보기"
        bodyKo="준비 중입니다. 곧 밭 상태와 재배 기록을 바탕으로 답해 드릴 수 있게 됩니다."
        icon={<QuestionIcon />}
        titleKo="무엇이든 물어보세요"
      />
    </main>
  );
}
