import { CloudRainIcon, WindIcon } from "@/components/icons";
import { dayFlag } from "@/features/weather/domain/forecastAlerts";
import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 7일 예보 표 — 하루 한 줄
 *
 * [Description]
 * - **하루가 한 줄에 들어간다.** 예전 화면은 한 줄에 날짜·기온·작물해석·강수·
 *   확률·습도·풍속 일곱 가지를 flex 로 늘어놓아, 375px 에서 기온이 두 줄로 접히고
 *   작물 해석이 네 줄이 되고 **풍속은 오른쪽으로 잘려 나갔다**(실측).
 *   지금은 고정 폭 칸 넷(날짜·기온·강수·바람)만 두고 나머지는 접힌 자리로 뺐다.
 * - **작물 해석을 매일 반복하지 않는다.** 예전에는 일곱 줄마다 "배추 생육 적온"
 *   같은 문장이 붙었다. 모든 줄이 무언가를 말하면 이상한 날이 묻힌다. 지금은
 *   임계를 넘은 날만 기온에 색이 들어가고, 무슨 일인지는 카드 위 경고가 말한다.
 * - 오늘은 날짜 대신 "오늘"이라고 적는다. 표를 볼 때 첫 줄이 오늘인지 세어 보게
 *   하지 않는다.
 * ---------------------------------------------
 */

/** 임계를 넘은 날의 기온 색. 무슨 임계인지는 카드 위 경고가 설명한다. */
const FLAG_CLASS = {
  frost: "text-info",
  cold: "text-info",
  hot: "text-caution",
} as const;

/** "2026-09-17" → "9/17 (수)". 요일을 함께 본다는 전제(format.ts 와 같은 방침). */
function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return "오늘";
  const date = new Date(`${iso}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`;
}

export function DailyRows({
  days,
  cropImpact,
  todayIso,
}: {
  days: PlotForecast["days"];
  cropImpact: PlotForecast["cropImpact"];
  /** "오늘"을 가리기 위한 기준일. 서버에서 렌더하므로 밖에서 넣어 준다. */
  todayIso: string;
}) {
  return (
    <section>
      {/* 단위를 줄마다 반복하지 않고 여기 한 번만 적는다. 실측에서 강수 칸에
          쓸 수 있는 폭이 40px 였는데 "12.5mm 80%" 는 72px 이라 일곱 줄 중
          여섯 줄이 잘려 나갔다. */}
      <h4 className="text-fg-muted text-xs">
        7일 예보{" "}
        <span className="text-fg-subtle">· 기온℃ / 강수mm·확률 / 바람m/s</span>
      </h4>
      <ol className="mt-1">
        {days.map((day) => {
          const flag = dayFlag(day, cropImpact);

          return (
            <li
              className="flex items-center gap-2 border-border/60 border-t py-2 first:border-t-0"
              key={day.date}
            >
              <span className="w-[3.75rem] shrink-0 font-medium text-fg-subtle text-xs">
                {dayLabel(day.date, todayIso)}
              </span>

              <span
                className={`w-[4.25rem] shrink-0 font-mono text-xs tabular-nums ${
                  flag ? FLAG_CLASS[flag] : "text-fg"
                }`}
              >
                {day.tempMin != null ? Math.round(day.tempMin) : "—"}°–
                {day.tempMax != null ? Math.round(day.tempMax) : "—"}°
              </span>

              {/* flex-1 을 쓰지 않는다. 넓은 화면에서 이 칸이 남는 폭을 다 먹어
                  풍속이 카드 오른쪽 끝까지 밀려나고, 한 줄을 읽는 시선 이동이
                  800px 가 된다. 칸을 고정하면 좁은 화면과 넓은 화면이 같은 모양이다. */}
              <span className="flex w-[5rem] shrink-0 items-center gap-1 font-mono text-fg text-xs tabular-nums">
                <CloudRainIcon className="size-3.5 shrink-0 text-info" />
                {day.rainfallMm != null ? day.rainfallMm : "—"}
                {day.rainChance != null && day.rainChance > 0 && (
                  <span className="text-info">{day.rainChance}%</span>
                )}
              </span>

              <span className="flex shrink-0 items-center gap-1 font-mono text-fg-muted text-xs tabular-nums">
                <WindIcon className="size-3.5 shrink-0" />
                {day.windMax != null ? Math.round(day.windMax) : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
