import type { Metadata } from "next";
import { CloudRainIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 날씨  →  /weather
 *
 * [Description]
 * - 하단 탭 다섯 개 중 하나. **아직 내용이 없는 화면**이라 빈 상태만 둔다.
 *   탭은 있는데 경로가 없으면 404 가 나므로, 자리를 먼저 만들고 "다음 행동"을
 *   제안한다(정의서의 빈 상태 규칙).
 * - 내용이 붙으면 이 파일의 EmptyState 를 목록으로 바꾸고, 비었을 때만
 *   같은 EmptyState 를 남긴다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "날씨" };

export default function Page() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="밭 좌표 기준 관측과 예보입니다."
        title="날씨"
      />
      <EmptyState
        actionHref="/plots/new"
        actionKo="텃밭 등록하기"
        bodyKo="밭 좌표가 있어야 그 자리의 기온·강수를 가져올 수 있습니다. 동네 평균이 아니라 밭 기준입니다."
        icon={<CloudRainIcon />}
        titleKo="밭 위치를 먼저 알려 주세요"
      />
    </main>
  );
}
