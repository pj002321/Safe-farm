import {
  ArrowRightIcon,
  CloudRainIcon,
  DropletIcon,
  WindIcon,
} from "@/components/icons";
import type { PlotForecast } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 현재 실황 — 밭 자리의 지금 값
 *
 * [Description]
 * - 카드를 열었을 때 가장 먼저 읽히는 숫자다. 기온 하나만 크게, 나머지는 곁에.
 *   셋을 같은 크기로 늘어놓으면 무엇부터 봐야 할지 알 수 없다.
 * - **관측 시각을 반드시 함께 적는다.** "지금 21℃" 는 언제 기준인지 없으면
 *   확인할 방법이 없는 문장이다. Open-Meteo 는 정시 단위로 갱신한다.
 * - 값이 없으면(`current` 가 null) 이 칸 자체를 그리지 않는다 — 대시(–)로 채운
 *   실황 칸은 "지금 0℃" 로 오해되기 쉽다.
 * ---------------------------------------------
 */

/** "2026-09-17T09:00" → "9월 17일 09시". 실황은 분이 의미 없다(정시 갱신). */
function observedLabel(iso: string): string {
  const [date, time] = iso.split("T");
  const [, month, day] = date.split("-");
  const hour = time?.slice(0, 2) ?? "";
  return `${Number(month)}월 ${Number(day)}일 ${hour}시 기준`;
}

export function WeatherNow({
  current,
}: {
  current: NonNullable<PlotForecast["current"]>;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
      <p className="flex items-baseline gap-1">
        <span className="font-semibold text-4xl text-fg tabular-nums tracking-tight">
          {current.tempC != null ? current.tempC.toFixed(1) : "—"}
        </span>
        <span className="text-fg-muted text-lg">℃</span>
      </p>

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 font-mono text-fg-muted text-xs tabular-nums">
        <div className="flex items-center gap-1">
          <dt>
            <DropletIcon aria-label="습도" className="size-3.5 text-info" />
          </dt>
          <dd>
            {current.humidityPct != null ? `${current.humidityPct}%` : "—"}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <dt>
            <CloudRainIcon aria-label="강수" className="size-3.5 text-info" />
          </dt>
          <dd>
            {current.rainfallMm != null ? `${current.rainfallMm}mm` : "—"}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <dt>
            <WindIcon aria-label="풍속" className="size-3.5" />
          </dt>
          <dd className="flex items-center gap-1">
            {current.windMs != null ? `${current.windMs}m/s` : "—"}
            {/* 기상청 표기는 "불어오는" 방향이라, 화살표는 180° 돌려 "불어가는" 쪽을 가리킨다. */}
            {current.windDeg != null && (
              <ArrowRightIcon
                aria-label={`풍향 ${current.windDeg}도`}
                className="size-3 text-fg-subtle"
                style={{ transform: `rotate(${current.windDeg + 90}deg)` }}
              />
            )}
          </dd>
        </div>
      </dl>

      {current.observedAt && (
        <p className="w-full font-mono text-[0.7rem] text-fg-subtle">
          {observedLabel(current.observedAt)}
        </p>
      )}
    </div>
  );
}
