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

function rainfallLabel(mm: number | null): string {
  return mm != null ? `${mm}mm` : "관측 없음";
}

/** 기온이 이 작물에 어떤 의미인지(V1-64) — 일반 날씨 앱은 숫자만 주지만
 * 여기는 그 숫자가 이 작물엔 스트레스인지 적온인지까지 병기한다. */
function tempImpactKo(
  tempMax: number | null,
  tempMin: number | null,
  impact: PlotForecast["cropImpact"],
): string | null {
  if (!impact || tempMax == null || tempMin == null) return null;
  if (impact.upperTempC != null && tempMax > impact.upperTempC) {
    return `${impact.cropNameKo} 고온 스트레스(상한 ${impact.upperTempC}℃)`;
  }
  if (tempMin < impact.baseTempC) {
    return `${impact.cropNameKo} 생육 정지(기준 ${impact.baseTempC}℃)`;
  }
  return `${impact.cropNameKo} 생육 적온`;
}

/** 누적 강수량이 이 작물 단계의 필요량을 채우는지(V1-64). 필요량이 없으면(단계
 * 판정 불가) 해석하지 않는다 — 근거 없는 판단은 후보에서 뺀다(task_rules.py 방침). */
function rainImpactKo(
  rainfall7d: number | null,
  impact: PlotForecast["cropImpact"],
): string | null {
  if (!impact || impact.waterNeedMm == null || rainfall7d == null) return null;
  const stage = impact.stageName ? `${impact.stageName} ` : "";
  return rainfall7d < impact.waterNeedMm
    ? `${stage}단계 필요량(${impact.waterNeedMm}mm) 대비 부족 — 관수 권장`
    : `${stage}단계 필요량 충족`;
}

/** 최근 하루치 GDD 막대(V1-69). 높이가 그날 기온이 얼마나 생육에 기여했는지를
 * 바로 보여줘, 생육 속도가 왜 그런지(더워서/추워서)를 숫자 없이도 읽게 한다. */
function GrowthSeriesBars({
  series,
}: {
  series: PlotForecast["growthSeries"] & object;
}) {
  const maxGdd = Math.max(...series.map((d) => d.gdd), 0.1);

  return (
    <div className="mt-3 border-border/60 border-t pt-3">
      <p className="text-fg-muted text-xs">최근 하루치 적산온도(GDD)</p>
      <div className="mt-2 flex items-end gap-1">
        {series.map((day) => (
          <div className="flex flex-col items-center gap-1" key={day.date}>
            <div
              className="w-3 rounded-t bg-accent"
              style={{ height: `${(day.gdd / maxGdd) * 40 + 2}px` }}
              title={`${day.date}: ${day.gdd}`}
            />
            <span className="font-mono text-[0.6rem] text-fg-subtle">
              {day.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

      <p className="mt-2 flex items-center gap-1.5 font-mono text-fg-muted text-xs tabular-nums">
        <DropletIcon className="size-3.5 text-info" />
        누적 강수량 3일 {rainfallLabel(forecast.rainfall3d)} · 5일{" "}
        {rainfallLabel(forecast.rainfall5d)} · 7일{" "}
        {rainfallLabel(forecast.rainfall7d)}
      </p>
      {rainImpactKo(forecast.rainfall7d, forecast.cropImpact) && (
        <p className="mt-0.5 text-[0.7rem] text-info">
          {rainImpactKo(forecast.rainfall7d, forecast.cropImpact)}
        </p>
      )}

      {forecast.growthSeries && forecast.growthSeries.length > 0 && (
        <GrowthSeriesBars series={forecast.growthSeries} />
      )}

      <div className="mt-3 flex flex-col gap-2">
        {forecast.days.map((day) => {
          const isFrostRisk =
            day.tempMin != null && day.tempMin <= FROST_THRESHOLD_C;
          const tempImpact = tempImpactKo(
            day.tempMax,
            day.tempMin,
            forecast.cropImpact,
          );

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
                  {tempImpact && (
                    <span className="font-sans text-fg-muted">
                      ({tempImpact})
                    </span>
                  )}
                </span>

                <span className="inline-flex items-center gap-1 font-mono text-fg text-xs tabular-nums">
                  <DropletIcon className="size-3.5 text-info" />
                  {day.rainfallMm != null ? `${day.rainfallMm}mm` : "–"}
                  {day.rainChance != null && ` (${day.rainChance}%)`}
                </span>

                <span className="inline-flex items-center gap-1 font-mono text-fg text-xs tabular-nums">
                  <DropletIcon className="size-3.5 text-info" />
                  {day.humidityPct != null ? `${day.humidityPct}%` : "–"}
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
