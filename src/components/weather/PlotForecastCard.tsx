import { DropletIcon, ThermometerIcon, WindIcon } from "@/components/icons";
import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 밭 좌표 기준 7일 예보 카드
 *
 * [Description]
 * - `/weather` 탭 한 밭당 한 장. Open-Meteo 실시간 조회(`aiService.plotForecast`)
 *   결과를 그대로 나열한다 — 과거 관측(weather_obs_daily)과 달리 캐시하지 않는다.
 * ---------------------------------------------
 */

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
        {forecast.days.map((day) => (
          <div
            className="flex items-center gap-3 border-border/60 border-t pt-2 first:border-t-0 first:pt-0"
            key={day.date}
          >
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
        ))}
      </div>
    </article>
  );
}
