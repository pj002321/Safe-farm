import type { Metadata } from "next";
import { MapIcon } from "@/components/icons";
import { PlotsMap } from "@/components/map/PlotsMap";
import { SigunguGddMap } from "@/components/map/SigunguGddMap";
import { SigunguWarnMap } from "@/components/map/SigunguWarnMap";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listPlots } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 지도  →  /map
 *
 * [Description]
 * - 텃밭 마커 지도(PlotsMap), 시군구 GDD 색칠 지도(SigunguGddMap, V1-37), 기상특보
 *   오버레이(SigunguWarnMap, V1-39)를 함께 둔다. 뒤 둘은 텃밭 등록 여부와 무관한
 *   전국 통계라 텃밭이 없어도 항상 보여준다.
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

      <SectionHeading
        description="GDD(생육적산온도)는 하루 평균기온에서 기준온도(5℃)를 뺀 값을 누적한 지표입니다. 시군구별 올해 누적 GDD가 평년보다 높은지 낮은지 색으로 봅니다."
        title="지역 생육 기상"
      />
      <SigunguGddMap />

      <SectionHeading
        description="한파·호우·강풍 등 발효 중인 기상특보가 있는 지역만 경고색으로 표시합니다."
        title="지역 기상특보"
      />
      <SigunguWarnMap />
    </main>
  );
}
