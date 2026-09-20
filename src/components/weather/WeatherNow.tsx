import { CloudRainIcon, DropletIcon, WindIcon } from "@/components/icons";
import type { PlotForecast } from "@/shared/aiService/client";
import { windArrowDeg, windLabelKo } from "@/shared/growth/windText";

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
 * - **풍속 옆에 풍향을 같이 적는다.** 숫자만으로는 "2.1m/s" 가 어디서 부는 바람인지
 *   알 수 없다. 방제·비닐 작업에서 바람 방향이 속도만큼 중요하다.
 *   ⚠ 글자는 **불어오는 쪽**("북북동풍"), 화살표는 **가는 쪽**을 가리킨다.
 *     그 까닭은 `shared/growth/windText` 에 적어 두었다.
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
  const windKo = windLabelKo(current.windDirDeg);
  const arrowDeg = windArrowDeg(current.windDirDeg);
  const 속도 = current.windMs != null ? `${current.windMs}m/s` : null;

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
            <WindIcon aria-label="바람" className="size-3.5" />
          </dt>
          <dd className="flex items-center gap-1">
            {arrowDeg != null && (
              // ⚠ `inline-block` 이 있어야 돈다. 기본값 inline 인 span 에는
              //   transform 이 아예 안 먹어서, 화살표가 늘 위만 가리킨다.
              // aria-hidden — 방향은 옆의 글자가 이미 말한다
              <span
                aria-hidden="true"
                className="inline-block text-fg-subtle"
                style={{ transform: `rotate(${arrowDeg}deg)` }}
              >
                ↑
              </span>
            )}
            {windKo && <span className="font-sans">{windKo}</span>}
            {속도 && <span>{속도}</span>}
            {/* 속도도 방향도 없을 때만 대시다. 방향만 있으면 "북서풍 —" 이 되는데,
                읽는 사람에게는 고장으로 보인다 */}
            {!속도 && !windKo && <span>—</span>}
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
