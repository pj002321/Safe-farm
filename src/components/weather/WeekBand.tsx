import { dayFlag } from "@/features/weather/domain/forecastAlerts";
import type { PlotForecast } from "@/shared/aiService/client";
import { FLAG_BAR } from "./dayFlagClass";

/**
 * ---------------------------------------------
 * [Feature]: 주간 기온 밴드 — 7일을 가로 7칸으로
 *
 * [Description]
 * - 7일 표를 세로로 쌓으면 250px 를 먹는다. 같은 7일을 가로 7칸 막대로 눕히면
 *   116px 에 들어가고, **한 주의 흐름이 숫자를 읽지 않아도 보인다** — 어느 날이
 *   춥고 어느 날이 더운지가 막대 위치로 바로 읽힌다.
 * - 막대는 그날의 **최저~최고 구간**이다. 주간 전체 최저~최고를 축으로 잡아
 *   상대 위치를 그린다.
 * - 임계를 넘은 날은 색이 바뀐다. 색은 `dayFlagClass` 한 곳에서 오므로 아래
 *   7일 표와 절대 달라지지 않는다.
 * - ⚠️ 관측이 없는 날(null)은 **0 으로 그리지 않는다.** 빈 트랙만 남긴다 —
 *   "모른다"와 "0도"는 다른 사실이다(카드 전체에 걸친 규칙).
 * ---------------------------------------------
 */

/** 일교차가 0 인 날도 칸이 사라지지 않게 하는 바닥(%). HourlyStrip 의 BAR_MIN_PX 와 같은 이유. */
const MIN_HEIGHT_PCT = 6;

/** "2026-09-17" → "17". 요일은 아래 줄에 따로 적는다. */
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function WeekBand({
  days,
  cropImpact,
  todayIso,
}: {
  days: PlotForecast["days"];
  cropImpact: PlotForecast["cropImpact"];
  todayIso: string;
}) {
  const week = days.slice(0, 7);
  const lows = week
    .map((d) => d.tempMin)
    .filter((t): t is number => t !== null);
  const highs = week
    .map((d) => d.tempMax)
    .filter((t): t is number => t !== null);
  if (lows.length === 0 || highs.length === 0) return null;

  const floor = Math.min(...lows);
  const ceil = Math.max(...highs);
  // 주 내내 기온이 같으면 분모가 0 이 된다. 그때는 전부 바닥 높이로 둔다.
  const span = ceil - floor;

  return (
    <section>
      <h4 className="text-fg-muted text-xs">
        이번 주 기온{" "}
        <span className="text-fg-subtle">
          {Math.round(floor)}~{Math.round(ceil)}℃
        </span>
      </h4>
      <ol className="mt-2 grid grid-cols-7 gap-1">
        {week.map((day) => {
          const flag = dayFlag(day, cropImpact);
          const known = day.tempMin !== null && day.tempMax !== null;
          const bottom =
            known && span > 0 ? ((day.tempMin as number) - floor) / span : 0;
          const height =
            known && span > 0
              ? Math.max(
                  MIN_HEIGHT_PCT,
                  (((day.tempMax as number) - (day.tempMin as number)) / span) *
                    100,
                )
              : MIN_HEIGHT_PCT;
          const date = new Date(`${day.date}T00:00:00`);

          return (
            <li className="min-w-0 text-center" key={day.date}>
              <span className="block truncate font-mono text-[0.65rem] text-fg tabular-nums sm:text-xs">
                {day.tempMax !== null ? Math.round(day.tempMax) : "—"}
              </span>
              {/* 트랙은 항상 그린다. 값이 없으면 막대만 안 올린다 — 칸이 통째로
                  비면 그 날이 없는 것처럼 보인다. */}
              <span className="relative mx-auto mt-1 block h-14 w-1.5 rounded-full bg-surface-2">
                {known && (
                  <span
                    className={`absolute inset-x-0 rounded-full ${flag ? FLAG_BAR[flag] : "bg-accent/70"}`}
                    style={{
                      bottom: `${bottom * 100}%`,
                      height: `${height}%`,
                    }}
                  />
                )}
              </span>
              <span className="mt-1 block truncate font-mono text-[0.65rem] text-fg-muted tabular-nums sm:text-xs">
                {day.tempMin !== null ? Math.round(day.tempMin) : "—"}
              </span>
              <span
                className={`mt-0.5 block truncate text-[0.65rem] sm:text-xs ${
                  day.date === todayIso
                    ? "font-medium text-accent"
                    : "text-fg-subtle"
                }`}
              >
                {day.date === todayIso ? "오늘" : WEEKDAY[date.getDay()]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
