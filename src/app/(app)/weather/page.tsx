import type { Metadata } from "next";
import { Suspense } from "react";
import { CloudRainIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
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
 * - 밭마다 좌표 기준 7일 예보(기온·강수·최대풍속)를 카드로 보여준다.
 * - **예보를 기다리는 동안 페이지 전체가 막히지 않는다.** 예전에는 서버에서
 *   `Promise.all` 로 밭 수만큼 Open-Meteo 를 다 받은 뒤에야 첫 픽셀이 나갔다 —
 *   밭이 셋이면 제목조차 그때까지 안 보였다. 지금은 껍데기를 먼저 보내고
 *   예보 부분만 `Suspense` 로 흘린다.
 * - 예보 호출은 **한 시간 캐시**한다(`aiService.plotForecast` 주석 참고).
 *   원본이 하루 몇 차례만 갱신되므로 요청마다 부를 이유가 없다.
 * - 밭이 없으면 예보를 낼 좌표가 없으니 빈 상태를 그대로 둔다.
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
          {plots.map((plot) => (
            // 밭마다 경계를 따로 둔다. 하나로 묶으면 가장 느린 밭이 나머지를
            // 붙잡아, 이미 받아 온 예보까지 같이 기다리게 된다.
            <Suspense
              fallback={
                <div className="rounded-lg border border-border bg-surface p-4">
                  <SatelliteScan
                    compact
                    labelKo={`${plot.nameKo ?? "이름 없는 밭"} 예보를 읽는 중`}
                  />
                </div>
              }
              key={plot.id}
            >
              <PlotForecast
                cropNameKo={plot.cropNameKo}
                latitude={plot.latitude}
                longitude={plot.longitude}
                nameKo={plot.nameKo ?? "이름 없는 밭"}
                plotId={plot.id}
              />
            </Suspense>
          ))}
        </div>
      )}
    </main>
  );
}

/**
 * 밭 하나의 예보. 실패해도 **그 카드만** 안내로 바뀐다.
 *
 * 예전에는 전체를 한 번에 그려서, 한 밭의 호출이 실패하면 그 자리만 비는 것이
 * 아니라 화면이 언제 나오는지부터 그 호출에 묶여 있었다.
 */
async function PlotForecast({
  latitude,
  longitude,
  nameKo,
  cropNameKo,
  plotId,
}: {
  latitude: number;
  longitude: number;
  nameKo: string;
  cropNameKo: string | null;
  plotId: string;
}) {
  // plotId 를 줘야 서버가 이 밭의 작물을 찾아 하루치 GDD 와 작물 기준 해석까지
  // 함께 돌려준다. 좌표만 주면 기온·강수 같은 일반 예보만 온다.
  const result = await aiService.plotForecast(latitude, longitude, plotId);

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-border border-dashed bg-surface-2/40 p-4 text-fg-muted text-sm">
        <span className="font-semibold text-fg">{nameKo}</span> 예보를 지금
        불러오지 못했습니다. 잠시 후 다시 확인해주세요.
      </div>
    );
  }

  return (
    <PlotForecastCard
      cropNameKo={cropNameKo}
      forecast={result.data}
      nameKo={nameKo}
    />
  );
}
