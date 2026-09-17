import type { Metadata } from "next";
import { CloudRainIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { PlotForecastCard } from "@/components/weather/PlotForecastCard";
import { listPlots } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 날씨  →  /weather
 *
 * [Description]
 * - 밭마다 좌표 기준 7일 예보(기온·강수·최대풍속)를 카드로 보여준다. Open-Meteo
 *   를 그때그때 불러온다(`aiService.plotForecast`) — 격자 기준 적재 테이블은
 *   쓸 파이프라인이 없어 만들지 않았다.
 * - 밭이 없으면 예보를 낼 좌표가 없으니 기존 빈 상태를 그대로 둔다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "날씨" };

export default async function Page() {
  const profile = await getCurrentProfile();
  const plots = profile ? await listPlots(profile.id) : [];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="밭 좌표 기준 관측과 예보입니다."
        title="날씨"
      />
      {plots.length === 0 ? (
        <EmptyState
          actionHref="/plots/new"
          actionKo="텃밭 등록하기"
          bodyKo="밭 좌표가 있어야 그 자리의 기온·강수를 가져올 수 있습니다. 동네 평균이 아니라 밭 기준입니다."
          icon={<CloudRainIcon />}
          titleKo="밭 위치를 먼저 알려 주세요"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {
            await Promise.all(
              plots.map(async (plot) => {
                const result = await aiService.plotForecast(
                  plot.latitude,
                  plot.longitude,
                );
                if (!result.ok) return null;
                return (
                  <PlotForecastCard
                    cropNameKo={plot.cropNameKo}
                    forecast={result.data}
                    key={plot.id}
                    nameKo={plot.nameKo ?? "이름 없는 밭"}
                  />
                );
              }),
            )
          }
        </div>
      )}
    </main>
  );
}
