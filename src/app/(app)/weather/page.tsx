import type { Metadata } from "next";
import { CloudRainIcon } from "@/components/icons";
import { WeatherChart } from "@/components/monitoring/WeatherChart";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { summarizeWeather } from "@/features/monitoring/domain/weatherSeries";
import { loadWeatherSeries } from "@/features/monitoring/weatherStore";
import { listPlotDetails } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: 날씨  →  /weather
 *
 * [Description]
 * - 밭마다 최근 3일 관측 + 앞으로 4일 예보를 한 차트에 그린다. 동네 평균이 아니라
 *   **밭에서 가장 가까운 관측소**와 **그 밭이 속한 격자**를 읽는다.
 * - 밭이 없으면 빈 상태를 그대로 둔다. 좌표가 없으면 읽을 자리가 없다.
 * - ⚠️ **예보 적재 코드가 아직 없고 관측도 얇다.** 차트가 비는 것이 지금은 정상
 *   동작이라, 값이 없을 때 "관측 없음"을 말하는 길을 컴포넌트 안에 뒀다.
 * - 오늘 날짜를 서버에서 한 번 정한다(`kstDateString()`). 컴포넌트가 각자
 *   `new Date()` 를 읽으면 서버와 브라우저가 다른 날을 그린다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "날씨" };

/** 차트 위에 붙는 한 줄. 스크린리더가 읽는 문장이기도 하다. */
function summaryKo(
  nameKo: string,
  summary: ReturnType<typeof summarizeWeather>,
): string {
  if (summary === null) return `${nameKo}: 최근 관측이 없습니다.`;
  const rain =
    summary.rainfallMm === null
      ? "강수량은 모릅니다"
      : `강수량 합계 ${summary.rainfallMm}mm`;
  return `${nameKo}: 최근 ${summary.days}일 평균 최고 ${summary.avgTempMaxC}℃, 최저 ${summary.avgTempMinC}℃, ${rain}.`;
}

export default async function Page() {
  const profile = await getCurrentProfile();
  const plots = profile ? await listPlotDetails(profile.id) : [];

  if (plots.length === 0) {
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

  const today = kstDateString();
  const weathers = await Promise.all(
    plots.map(async (plot) => ({
      plot,
      weather: await loadWeatherSeries(plot, today),
    })),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="밭 좌표 기준 관측과 예보입니다."
        title="날씨"
      />

      {weathers.map(({ plot, weather }) => {
        const nameKo = plot.nameKo ?? plot.regionKo;
        const summary = summarizeWeather(weather.series);

        return (
          <Card key={plot.id}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-fg">{nameKo}</h2>
                <p className="text-fg-muted text-xs">
                  {weather.stationNameKo
                    ? `${weather.stationNameKo} 관측소 기준`
                    : "가까운 관측소를 찾지 못했습니다"}
                </p>
              </div>

              <WeatherChart
                series={weather.series}
                summary={summaryKo(nameKo, summary)}
              />

              {summary !== null && (
                <p className="text-fg-muted text-sm">
                  {summaryKo(nameKo, summary)}
                </p>
              )}
            </div>
          </Card>
        );
      })}
    </main>
  );
}
