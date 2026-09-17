import {
  AlertTriangleIcon,
  DropletIcon,
  ThermometerIcon,
  WindIcon,
} from "@/components/icons";
import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 밭 좌표 기준 7일 예보 카드
 *
 * [Description]
 * - `/weather` 탭 한 밭당 한 장. Open-Meteo 실시간 조회(`aiService.plotForecast`)
 *   결과를 그대로 나열한다 — 과거 관측(weather_obs_daily)과 달리 캐시하지 않는다.
 * - 최저기온이 2℃ 이하인 날은 서리 위험으로 보고 그 줄 아래 경고를 붙인다
 *   (스펙 V1-65). 임계값을 넘는지만 보므로 도메인 계산이 아니라 여기서 바로 판단한다.
 * ---------------------------------------------
 */

/** 서리 위험 임계값(℃). 이 이하면 경고를 붙인다. */
const FROST_THRESHOLD_C = 2;

interface PlotForecastCardProps {
  nameKo: string;
  cropNameKo: string | null;
  forecast: PlotForecast;
}

export function PlotForecastCard({
  nameKo,
  cropNameKo,
  forecast,
}: PlotForecastCardProps) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <p className="font-semibold text-fg text-sm">{nameKo}</p>
      <p className="text-fg-muted text-xs">{cropNameKo ?? "작물 미정"}</p>

      <div className="mt-3 flex flex-col gap-2">
        {forecast.days.map((day) => {
          const isFrostRisk =
            day.tempMin != null && day.tempMin <= FROST_THRESHOLD_C;

          return (
            <div
              className="border-border/60 border-t pt-2 first:border-t-0 first:pt-0"
              key={day.date}
            >
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 font-mono text-fg-subtle text-xs">
                  {day.date.slice(5)}
                </span>

                <span className="inline-flex items-center gap-1 font-mono text-fg text-xs tabular-nums">
                  <ThermometerIcon className="size-3.5 text-caution" />
                  {day.tempMin ?? "–"}–{day.tempMax ?? "–"}℃
                </span>

                <span className="inline-flex items-center gap-1 font-mono text-fg text-xs tabular-nums">
                  <DropletIcon className="size-3.5 text-info" />
                  {day.rainfallMm != null ? `${day.rainfallMm}mm` : "–"}
                  {day.rainChance != null && ` (${day.rainChance}%)`}
                </span>

                <span className="ml-auto inline-flex items-center gap-1 font-mono text-fg text-xs tabular-nums">
                  <WindIcon className="size-3.5 text-fg-muted" />
                  {day.windMax != null ? `${day.windMax}m/s` : "–"}
                </span>
              </div>

              {isFrostRisk && (
                <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-unsuitable/10 px-2.5 py-1.5 text-[0.76rem] text-unsuitable leading-relaxed">
                  <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                  서리 위험 — 최저기온 {day.tempMin}℃. 덮개·부직포로 작물을
                  덮거나 관수로 지열을 보호하세요.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
