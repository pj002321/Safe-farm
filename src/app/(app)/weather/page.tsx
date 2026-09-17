import type { Metadata } from "next";
import { Suspense } from "react";
import { CloudRainIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { PlotForecastCard } from "@/components/weather/PlotForecastCard";
import { listPlots } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import {
  recallForecast,
  rememberForecast,
} from "@/shared/aiService/lastGoodForecast";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 날씨  →  /weather
 *
 * [Description]
 * - 밭마다 한 장. 카드 안에 현재 실황 · 시간별 24시간 · 7일 예보 · 기상특보 ·
 *   서리·고온·관수 경고 · 누적 강수량 · 하루치 GDD 가 들어간다.
 * - **예보를 기다리는 동안 페이지 전체가 막히지 않는다.** 예전에는 `Promise.all`
 *   로 밭 수만큼 호출을 다 받은 뒤에야 첫 픽셀이 나갔다 — 밭이 셋이면 제목조차
 *   그때까지 안 보였다. 지금은 껍데기를 먼저 보내고 밭별로 흘린다.
 * - **한 밭이 실패해도 그 카드만 바뀐다.** 그마저도 조금 전 값이 있으면 그것을
 *   보여준다(`lastGoodForecast`) — 다만 언제 것인지 반드시 함께 적는다.
 * - 밭이 없으면 예보를 낼 좌표가 없으니 빈 상태를 그대로 둔다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "날씨" };

export default async function Page() {
  const profile = await getCurrentProfile();
  const plots = profile ? await listPlots(profile.id) : [];
  // 카드가 "오늘"을 가리려면 기준일이 필요하다. 서버에서 한 번만 정해 내려보낸다 —
  // 카드마다 new Date() 를 부르면 자정 언저리에 카드끼리 날짜가 갈릴 수 있다.
  //
  // 로케일이 `sv-SE` 인 건 스웨덴과 무관하다. 그 로케일의 기본 날짜 형식이
  // `YYYY-MM-DD` 라 서버 응답(ISO)과 바로 비교된다. `toISOString()` 은 UTC 라
  // 한국 시간 0~9시 사이에 **어제 날짜**를 준다 — 그래서 쓸 수 없다.
  const todayIso = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="밭 좌표 기준 실황과 예보입니다."
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
        <div className="flex flex-col gap-4">
          {plots.map((plot) => (
            // 밭마다 경계를 따로 둔다. 하나로 묶으면 가장 느린 밭이 나머지를
            // 붙잡아, 이미 받아 온 예보까지 같이 기다리게 된다.
            <Suspense
              fallback={
                <div className="rounded-xl border border-border bg-surface p-4">
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
                todayIso={todayIso}
              />
            </Suspense>
          ))}
        </div>
      )}
    </main>
  );
}

/**
 * 밭 하나의 예보.
 *
 * 실패했을 때의 순서가 이 함수의 전부다:
 *   ① 조금 전 받아 둔 값이 있으면 그것을 보여준다(언제 것인지 적어서)
 *   ② 그것도 없으면 그 **카드만** 안내로 바뀐다
 */
async function PlotForecast({
  latitude,
  longitude,
  nameKo,
  cropNameKo,
  plotId,
  todayIso,
}: {
  latitude: number;
  longitude: number;
  nameKo: string;
  cropNameKo: string | null;
  plotId: string;
  todayIso: string;
}) {
  // plotId 를 줘야 서버가 이 밭의 작물·행정구역을 찾아 하루치 GDD·작물 해석·
  // 기상특보까지 함께 돌려준다. 좌표만 주면 일반 기상값만 온다.
  const result = await aiService.plotForecast(latitude, longitude, plotId);

  if (result.ok) {
    rememberForecast(plotId, result.data);
    return (
      <PlotForecastCard
        cropNameKo={cropNameKo}
        forecast={result.data}
        nameKo={nameKo}
        todayIso={todayIso}
      />
    );
  }

  const stale = recallForecast(plotId);
  if (stale) {
    return (
      <PlotForecastCard
        cachedAt={stale.cachedAt}
        cropNameKo={cropNameKo}
        forecast={stale.data}
        nameKo={nameKo}
        todayIso={todayIso}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-2/40 p-4 text-fg-muted text-sm">
      <span className="font-semibold text-fg">{nameKo}</span> 예보를 지금
      불러오지 못했습니다. 잠시 후 다시 확인해주세요.
    </div>
  );
}
