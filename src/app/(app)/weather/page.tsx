import type { Metadata } from "next";
import { Suspense } from "react";
import { CloudRainIcon } from "@/components/icons";
import { WeatherChart } from "@/components/monitoring/WeatherChart";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { PlotForecastRow } from "@/components/weather/PlotForecastRow";
import { PlotRowSkeleton } from "@/components/weather/PlotRowSkeleton";
import { SatellitePanel } from "@/components/weather/SatellitePanel";
import { summarizeWeather } from "@/features/monitoring/domain/weatherSeries";
import { loadWeatherSeries } from "@/features/monitoring/weatherStore";
import { listPlots } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import {
  recallForecast,
  rememberForecast,
} from "@/shared/aiService/lastGoodForecast";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";

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

/** NDVI·NDMI 조회 구간(일). Sentinel-2 재방문 주기(5일)+구름을 감안해 넉넉히 잡는다. */
const SATELLITE_WINDOW_DAYS = 90;

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
  const plots = profile ? await listPlots(profile.id) : [];
  // 카드가 "오늘"을 가리려면 기준일이 필요하다. 서버에서 한 번만 정해 내려보낸다 —
  // 카드마다 new Date() 를 부르면 자정 언저리에 카드끼리 날짜가 갈릴 수 있다.
  //
  // 로케일이 `sv-SE` 인 건 스웨덴과 무관하다. 그 로케일의 기본 날짜 형식이
  // `YYYY-MM-DD` 라 서버 응답(ISO)과 바로 비교된다. `toISOString()` 은 UTC 라
  // 한국 시간 0~9시 사이에 **어제 날짜**를 준다 — 그래서 쓸 수 없다.
  const todayIso = kstDateString();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      {/* 홈·내 정보와 같은 머리말 구조(위 지도 페이지 주석 참고). */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          description="밭 좌표 기준 실황과 예보입니다."
          eyebrow="weather"
          title="날씨"
        />
      </div>
      {plots.length === 0 ? (
        <EmptyState
          actionHref="/plots/new"
          actionKo="텃밭 등록하기"
          bodyKo="밭 좌표가 있어야 그 자리의 기온·강수를 가져올 수 있습니다. 동네 평균이 아니라 밭 기준입니다."
          icon={<CloudRainIcon />}
          titleKo="밭 위치를 먼저 알려 주세요"
        />
      ) : (
        // 밭이 목록이므로 목록 요소로 적는다 — 스크린리더가 "3개 중 2번째"를 말한다.
        <ol className="flex flex-col gap-2">
          {plots.map((plot, index) => (
            // 밭마다 경계를 따로 둔다. 하나로 묶으면 가장 느린 밭이 나머지를
            // 붙잡아, 이미 받아 온 예보까지 같이 기다리게 된다.
            <li key={plot.id}>
              <Suspense
                // 목록 자리는 스켈레톤이 맞다 — 밭마다 로딩 연출을 띄우면 화면이
                // 번쩍이고, 도착하는 순간 크기가 달라 아래가 밀린다.
                fallback={
                  <PlotRowSkeleton nameKo={plot.nameKo ?? "이름 없는 밭"} />
                }
              >
                <PlotForecast
                  cropNameKo={plot.cropNameKo}
                  // 첫 줄만 펴 둔다. 전부 접히면 화면이 비어 보이고, 줄을 펼 수
                  // 있다는 것도 알 길이 없다. "가장 심한 밭"을 여는 건 하지 않는다 —
                  // 그러려면 밭 전체 예보를 먼저 기다려야 해서, 밭별 Suspense 로
                  // 흘려보내는 이 구조가 무너진다.
                  defaultOpen={index === 0}
                  gridX={plot.gridX}
                  gridY={plot.gridY}
                  latitude={plot.latitude}
                  longitude={plot.longitude}
                  nameKo={plot.nameKo ?? "이름 없는 밭"}
                  plotId={plot.id}
                  todayIso={todayIso}
                />
              </Suspense>
            </li>
          ))}
        </ol>
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
  gridX,
  gridY,
  nameKo,
  cropNameKo,
  plotId,
  todayIso,
  defaultOpen,
}: {
  latitude: number;
  longitude: number;
  gridX: number;
  gridY: number;
  nameKo: string;
  cropNameKo: string | null;
  plotId: string;
  todayIso: string;
  defaultOpen: boolean;
}) {
  // plotId 를 줘야 서버가 이 밭의 작물·행정구역을 찾아 하루치 GDD·작물 해석·
  // 기상특보까지 함께 돌려준다. 좌표만 주면 일반 기상값만 온다.
  //
  // 관측 계열은 **예보와 나란히** 받는다. 둘은 서로를 기다릴 이유가 없고, 이 밭의
  // 경계 안이라 느려도 다른 밭을 붙잡지 않는다.
  const satelliteFrom = kstDateString(
    new Date(Date.now() - SATELLITE_WINDOW_DAYS * 86_400_000),
  );

  const [result, weather, satellite] = await Promise.all([
    aiService.plotForecast(latitude, longitude, plotId),
    loadWeatherSeries({ latitude, longitude, gridX, gridY }, todayIso).catch(
      (error) => {
        // 관측이 없어도 예보는 보여 준다 — 차트 하나 때문에 줄 전체를 죽이지 않는다.
        console.error("[weather] 관측 계열 조회 실패", error);
        return null;
      },
    ),
    aiService.satelliteObservations(
      latitude,
      longitude,
      satelliteFrom,
      todayIso,
    ),
  ]);

  const chart = weather ? (
    <WeatherChart
      series={weather.series}
      summary={summaryKo(nameKo, summarizeWeather(weather.series))}
    />
  ) : null;

  // 위성도 실패해도 줄 전체를 죽이지 않는다 — 예보·기상 관측과 같은 원칙.
  const satelliteChart = satellite.ok ? (
    <SatellitePanel points={satellite.data.points} />
  ) : null;

  if (result.ok) {
    rememberForecast(plotId, result.data);
    return (
      <PlotForecastRow
        chart={chart}
        cropNameKo={cropNameKo}
        defaultOpen={defaultOpen}
        forecast={result.data}
        nameKo={nameKo}
        plotId={plotId}
        satelliteChart={satelliteChart}
        todayIso={todayIso}
      />
    );
  }

  const stale = recallForecast(plotId);
  if (stale) {
    return (
      <PlotForecastRow
        cachedAt={stale.cachedAt}
        chart={chart}
        cropNameKo={cropNameKo}
        defaultOpen={defaultOpen}
        forecast={stale.data}
        nameKo={nameKo}
        plotId={plotId}
        satelliteChart={satelliteChart}
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
