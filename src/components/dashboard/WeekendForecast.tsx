import { CloudRainIcon, DropletIcon, SunIcon } from "@/components/icons";
import type { DayForecast } from "./sample";

/**
 * ---------------------------------------------
 * [Feature]: 주말 예보 요약 (마크업 전용)
 *
 * [Description]
 * - 이 카드의 목적은 날씨를 알리는 것이 아니라 **야외 작업이 가능한지 판단**하게
 *   돕는 것이다(스펙). 그래서 숫자보다 `workableKo` 한 줄이 아래에 크게 붙는다.
 *   기온·강수확률만 나열하면 사용자가 매번 스스로 판단해야 한다.
 * - 기온은 `tabular-nums` 로 자릿수를 고정한다. 토·일이 세로로 놓이는데 숫자
 *   폭이 흔들리면 두 줄이 어긋나 비교가 어려워진다.
 * - 강수확률을 막대로 함께 그린다. 60%가 10%보다 얼마나 높은지는 숫자보다
 *   길이로 보는 편이 빠르다.
 *
 * [Usage]
 * ```tsx
 * <WeekendForecast days={SAMPLE_WEEKEND} />
 * ```
 * ---------------------------------------------
 */

interface WeekendForecastProps {
  days: readonly DayForecast[];
}

export function WeekendForecast({ days }: WeekendForecastProps) {
  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => (
        <article
          className="rounded-lg border border-border bg-surface p-4"
          key={day.labelKo}
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ${
                day.icon === "rain"
                  ? "bg-info/10 text-info"
                  : "bg-caution/10 text-caution"
              }`}
            >
              {day.icon === "rain" ? <CloudRainIcon /> : <SunIcon />}
            </span>

            <div className="min-w-0">
              <p className="font-semibold text-fg text-sm">
                {day.labelKo}
                <span className="ml-1.5 font-mono text-fg-subtle text-xs">
                  {day.dateKo}
                </span>
              </p>
              <p className="font-mono text-[0.8rem] text-fg-muted tabular-nums">
                {day.tempMinC.toFixed(1)} – {day.tempMaxC.toFixed(1)}℃
              </p>
            </div>

            <div className="ml-auto text-right">
              <p className="inline-flex items-center gap-1 font-mono text-[0.8rem] text-fg tabular-nums">
                <DropletIcon className="size-3.5 text-info" />
                {day.rainChance}%
              </p>
              <p className="font-mono text-[0.68rem] text-fg-subtle tabular-nums">
                {day.rainMm > 0 ? `${day.rainMm.toFixed(1)}mm` : "강수 없음"}
              </p>
            </div>
          </div>

          {/* 강수확률 막대. 숫자와 같은 정보를 길이로도 준다. */}
          <div
            aria-hidden="true"
            className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full bg-info"
              style={{ width: `${day.rainChance}%` }}
            />
          </div>

          <p className="mt-2.5 text-[0.82rem] text-fg leading-relaxed">
            {day.workableKo}
          </p>
        </article>
      ))}
    </div>
  );
}
