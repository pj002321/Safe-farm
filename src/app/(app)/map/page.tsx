import type { Metadata } from "next";
import { MapIcon } from "@/components/icons";
import { PlotsMap } from "@/components/map/PlotsMap";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listPlots } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 지도  →  /map
 *
 * [Description]
 * - 하단 탭 다섯 개 중 하나. **아직 내용이 없는 화면**이라 빈 상태만 둔다.
 *   탭은 있는데 경로가 없으면 404 가 나므로, 자리를 먼저 만들고 "다음 행동"을
 *   제안한다(정의서의 빈 상태 규칙).
 * - 내용이 붙으면 이 파일의 EmptyState 를 목록으로 바꾸고, 비었을 때만
 *   같은 EmptyState 를 남긴다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "지도" };

export default async function Page() {
  const profile = await getCurrentProfile();
  const plots = profile ? await listPlots(profile.id) : [];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="등록한 밭을 위성 관측과 겹쳐 봅니다."
        title="지도"
      />
      {plots.length === 0 ? (
        <EmptyState
          actionHref="/plots/new"
          actionKo="텃밭 등록하기"
          bodyKo="텃밭을 등록하시면 위성이 본 밭 상태를 지도 위에 겹쳐 보여 드립니다."
          icon={<MapIcon />}
          titleKo="아직 보여 드릴 밭이 없습니다"
        />
      ) : (
        <PlotsMap points={plots} />
      )}
    </main>
  );
}
