import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 시간별 24시간 — 지금부터 하루
 *
 * [Description]
 * - 일별 표로는 "오후에 비가 오나"를 알 수 없다. 하루 합계 5mm 는 온종일 이슬비일
 *   수도, 오후 3시에 몰아치는 것일 수도 있는데 밭일 계획은 그 차이로 갈린다.
 * - **가로 스크롤을 쓴다.** 24칸을 화면 폭에 욱여넣으면 한 칸이 13px 이라 숫자를
 *   못 읽는다. 세로로 24줄을 쌓으면 카드가 그것만으로 길어진다.
 *   ⚠️ 가로 스크롤은 페이지 전체가 아니라 **이 띠 안에서만** 일어난다.
 * - 기온을 막대로도 그린다. 숫자만 늘어놓으면 24개를 다 읽어야 흐름이 보인다.
 * - 서버가 이미 **지난 시간을 잘라서** 준다(`normalize_hourly`). Open-Meteo 는
 *   hourly 를 오늘 00시부터 주기 때문에 앞에서 자르면 지난 시간을 보여주게 된다.
 * ---------------------------------------------
 */

/** 막대 높이 범위(px). 0 이면 칸이 사라져 보이므로 바닥을 둔다. */
const BAR_MIN_PX = 4;
const BAR_MAX_PX = 36;

/**
 * 이 확률 미만은 적지 않는다.
 *
 * 맑은 날도 시간마다 5~10%가 붙는데, 그걸 다 적으면 24칸 전부에 숫자가 서서
 * 정작 비 오는 구간이 안 보인다(실측: 맑은 날 24칸 중 20칸에 "5%"가 찍혔다).
 */
const RAIN_CHANCE_FLOOR = 20;

export function HourlyStrip({ hours }: { hours: PlotForecast["hours"] }) {
  if (hours.length === 0) return null;

  const temps = hours
    .map((h) => h.tempC)
    .filter((t): t is number => t !== null);
  if (temps.length === 0) return null;

  const min = Math.min(...temps);
  const max = Math.max(...temps);
  // 하루 내내 같은 기온이면 분모가 0 이 된다. 그때는 전부 바닥 높이로 둔다.
  const span = max - min;

  return (
    <section>
      <h4 className="text-fg-muted text-xs">시간별 (24시간)</h4>
      <div className="-mx-4 mt-2 overflow-x-auto px-4">
        <ol className="flex w-max gap-3">
          {hours.map((hour) => {
            const height =
              hour.tempC == null || span === 0
                ? BAR_MIN_PX
                : BAR_MIN_PX +
                  ((hour.tempC - min) / span) * (BAR_MAX_PX - BAR_MIN_PX);

            return (
              <li
                className="flex w-9 shrink-0 flex-col items-center gap-1"
                key={hour.time}
              >
                <span className="font-mono text-[0.65rem] text-fg tabular-nums">
                  {hour.tempC != null ? Math.round(hour.tempC) : "—"}°
                </span>
                <span
                  className="w-1.5 rounded-full bg-accent/70"
                  style={{ height: `${height}px` }}
                />
                <span className="h-3 font-mono text-[0.6rem] text-info tabular-nums">
                  {hour.rainChance != null &&
                  hour.rainChance >= RAIN_CHANCE_FLOOR
                    ? `${hour.rainChance}%`
                    : ""}
                </span>
                <span className="font-mono text-[0.65rem] text-fg-subtle tabular-nums">
                  {hour.time.slice(11, 13)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
