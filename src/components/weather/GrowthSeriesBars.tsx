import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 최근 14일 하루치 GDD 막대 (V1-69)
 *
 * [Description]
 * - 생육이 빠르거나 느린 **이유**를 보여준다. 누적 GDD 숫자 하나로는 "왜 이런지"를
 *   알 수 없는데, 하루치를 늘어놓으면 추웠던 구간이 눈에 바로 보인다.
 * - **날짜를 막대마다 붙이지 않는다.** 14개에 "09-03" 같은 라벨을 다 달면 한
 *   칸이 20px 인데 글자는 그보다 넓어 서로 겹친다(실측). 양 끝만 적고 나머지는
 *   막대에 `title` 로 둔다 — 기간이 어디서 어디까지인지만 알면 되는 그림이다.
 * - 값이 없으면 이 칸 자체를 안 그린다. 빈 축만 남으면 고장으로 읽힌다.
 * ---------------------------------------------
 */

const BAR_MIN_PX = 2;
const BAR_MAX_PX = 40;

/** "2026-09-03" → "9/3" */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function GrowthSeriesBars({
  series,
}: {
  series: NonNullable<PlotForecast["growthSeries"]>;
}) {
  if (series.length === 0) return null;

  // 0 으로 나누지 않도록 바닥을 둔다. 전부 0(내내 기준온도 아래)일 수 있다.
  const max = Math.max(...series.map((d) => d.gdd), 0.1);

  return (
    <section>
      <h4 className="text-fg-muted text-xs">
        최근 하루치 적산온도(GDD) — 막대가 낮은 날은 생육이 거의 멈춘 날입니다
      </h4>
      <div className="mt-2 flex h-11 items-end gap-1">
        {series.map((day) => (
          <span
            className="min-w-0 flex-1 rounded-t bg-accent/70"
            key={day.date}
            style={{
              height: `${BAR_MIN_PX + (day.gdd / max) * (BAR_MAX_PX - BAR_MIN_PX)}px`,
            }}
            title={`${shortDate(day.date)}: ${day.gdd}GDD`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-fg-subtle">
        <span>{shortDate(series[0].date)}</span>
        <span>{shortDate(series[series.length - 1].date)}</span>
      </div>
    </section>
  );
}
