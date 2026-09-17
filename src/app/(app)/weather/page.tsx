import type { Metadata } from "next";
import { CloudRainIcon } from "@/components/icons";
import { WeatherChart } from "@/components/monitoring/WeatherChart";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { PlotForecastCard } from "@/components/weather/PlotForecastCard";
import { summarizeWeather } from "@/features/monitoring/domain/weatherSeries";
import { loadWeatherSeries } from "@/features/monitoring/weatherStore";
import { listPlotDetails, listPlots } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: 날씨  →  /weather
 *
 * [Description]
 * - 밭 한 곳에 **지난 것과 앞으로 올 것**을 나란히 둔다. 출처가 둘이라 한 차트에
 *   못 섞는다:
 *     · 과거 — DB 적재분(`weather_obs_daily`). **밭에서 가장 가까운 관측소**와
 *       **그 밭이 속한 격자**를 읽는다. 동네 평균이 아니다.
 *     · 예보 — Open-Meteo 를 그때그때 부른다(`aiService.plotForecast`).
 *       격자 기준 예보 적재 테이블은 돌릴 파이프라인이 없어 만들지 않았다.
 * - 밭이 없으면 빈 상태를 그대로 둔다. 좌표가 없으면 읽을 자리가 없다.
 * - ⚠️ **관측 적재가 아직 얇다.** 차트가 비는 것이 지금은 정상 동작이라, 값이
 *   없을 때 "관측 없음"을 말하는 길을 컴포넌트 안에 뒀다.
 * - 예보 호출은 밭마다 따로 나가고 **실패해도 그 밭만 접는다.** 한 밭이 안 된다고
 *   나머지 밭의 관측까지 못 보게 할 이유가 없다.
 * - 오늘 날짜를 서버에서 한 번 정한다(`kstDateString()`). 컴포넌트가 각자
 *   `new Date()` 를 읽으면 서버와 브라우저가 다른 날을 그린다.
 * - 밭을 두 번 읽는다. 차트는 격자(`PlotDetail.gridX/gridY`)가, 예보 카드는 작물
 *   이름(`PlotMapPoint.cropNameKo`)이 필요한데 한 타입이 둘 다 갖고 있지 않다.
 *   밭 수만큼이 아니라 화면당 두 번이다.
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
  const [plots, points] = profile
    ? await Promise.all([listPlotDetails(profile.id), listPlots(profile.id)])
    : [[], []];

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

  const cropByPlotId = new Map(points.map((p) => [p.id, p.cropNameKo]));
  const today = kstDateString();
  const sections = await Promise.all(
    plots.map(async (plot) => {
      const [weather, forecast] = await Promise.all([
        loadWeatherSeries(plot, today),
        aiService.plotForecast(plot.latitude, plot.longitude, plot.id),
      ]);
      return { plot, weather, forecast };
    }),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="밭 좌표 기준 관측과 예보입니다."
        title="날씨"
      />

      {sections.map(({ plot, weather, forecast }) => {
        const nameKo = plot.nameKo ?? plot.regionKo;
        const summary = summarizeWeather(weather.series);

        return (
          <section className="flex flex-col gap-3" key={plot.id}>
            <Card>
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

            {forecast.ok ? (
              <PlotForecastCard
                cropNameKo={cropByPlotId.get(plot.id) ?? null}
                forecast={forecast.data}
                nameKo={nameKo}
              />
            ) : (
              <div className="rounded-lg border border-border border-dashed bg-surface-2/40 p-4 text-fg-muted text-sm">
                <span className="font-semibold text-fg">{nameKo}</span> 예보를
                지금 불러오지 못했습니다. 잠시 후 다시 확인해주세요.
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
