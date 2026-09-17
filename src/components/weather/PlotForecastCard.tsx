import { buildForecastAlerts } from "@/features/weather/domain/forecastAlerts";
import type { PlotForecast } from "@/shared/aiService/client";
import { DailyRows } from "./DailyRows";
import { ForecastAlerts } from "./ForecastAlerts";
import { GrowthSeriesBars } from "./GrowthSeriesBars";
import { HourlyStrip } from "./HourlyStrip";
import { StaleNotice } from "./StaleNotice";
import { WeatherNow } from "./WeatherNow";

/**
 * ---------------------------------------------
 * [Feature]: 밭 예보 카드 — `/weather` 한 밭당 한 장
 *
 * [Description]
 * - **읽는 순서대로 쌓는다.** 위험 → 지금 → 하루 → 한 주 → 자세히.
 *   예전 카드는 누적 강수량·GDD 막대·7일 표 순서였고 경고는 표 중간에 묻혀 있어,
 *   가장 급한 것을 보려면 가장 많이 스크롤해야 했다.
 * - **자세한 값은 접는다.** 습도·강수확률·누적강수·GDD 막대는 매일 볼 것이
 *   아니라 궁금할 때 여는 값이다. 밭이 셋이면 카드도 셋인데 전부 펴 두면
 *   화면이 3000px 가 된다(실측: 예전 카드 한 장이 872px).
 *   `<details>` 라 JS 없이 열린다.
 * - 판정은 여기서 하지 않는다. `buildForecastAlerts`(순수)가 만든 것을 얹는다.
 * ---------------------------------------------
 */

interface PlotForecastCardProps {
  nameKo: string;
  cropNameKo: string | null;
  forecast: PlotForecast;
  /** "오늘"을 가리는 기준일(YYYY-MM-DD). 서버 렌더라 밖에서 넣어 준다. */
  todayIso: string;
  /**
   * 값이 있으면 이 예보는 **실시간이 아니라 보관해 둔 것**이다.
   * 카드가 그 사실을 반드시 드러낸다 — 사흘 전 서리 예보를 오늘 것으로 읽으면
   * 실제 피해가 난다.
   */
  cachedAt?: Date;
}

export function PlotForecastCard({
  nameKo,
  cropNameKo,
  forecast,
  todayIso,
  cachedAt,
}: PlotForecastCardProps) {
  const alerts = buildForecastAlerts(forecast);
  const stage = forecast.cropImpact?.stageName;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="font-semibold text-fg">{nameKo}</h3>
        <p className="text-fg-muted text-sm">
          {cropNameKo ?? "작물 미정"}
          {stage && <span className="text-accent"> · {stage}</span>}
        </p>
      </header>

      {cachedAt && <StaleNotice cachedAt={cachedAt} />}

      {/*
        실황이 경고보다 **위**다. 경고는 색과 테두리로 이미 눈에 띄고, 없는 날이
        대부분이다. 반면 "지금 몇 도인가"는 날씨 화면을 여는 기본 이유라 늘 있다.
        경고를 맨 위에 두면 경고가 다섯 장인 날(실측 390px) 카드를 열었을 때
        숫자가 한 개도 안 보인다.
      */}
      {forecast.current && <WeatherNow current={forecast.current} />}

      <ForecastAlerts alerts={alerts} />

      <HourlyStrip hours={forecast.hours} />

      <DailyRows
        cropImpact={forecast.cropImpact}
        days={forecast.days}
        todayIso={todayIso}
      />

      <details className="border-border/60 border-t pt-3">
        <summary className="cursor-pointer text-fg-muted text-xs hover:text-fg">
          누적 강수량 · 생육 속도 자세히 보기
        </summary>

        <div className="mt-3 flex flex-col gap-4">
          <section>
            <h4 className="text-fg-muted text-xs">
              누적 강수량 (최근접 관측소 실측)
            </h4>
            <dl className="mt-1 flex gap-4 font-mono text-fg text-sm tabular-nums">
              <Window days={3} mm={forecast.rainfall3d} />
              <Window days={5} mm={forecast.rainfall5d} />
              <Window days={7} mm={forecast.rainfall7d} />
            </dl>
          </section>

          {forecast.growthSeries && forecast.growthSeries.length > 0 && (
            <GrowthSeriesBars series={forecast.growthSeries} />
          )}
        </div>
      </details>
    </article>
  );
}

/**
 * 누적 강수량 한 칸.
 *
 * 관측이 없으면 0mm 가 아니라 "관측 없음"이다. 둘을 같게 적으면 "비가 안 왔다"와
 * "모른다"가 뭉개져, 관수 판단이 뒤집힌다.
 */
function Window({ days, mm }: { days: number; mm: number | null }) {
  return (
    <div>
      <dt className="font-sans text-fg-subtle text-xs">{days}일</dt>
      <dd>
        {mm != null ? (
          `${mm}mm`
        ) : (
          <span className="text-fg-subtle">관측 없음</span>
        )}
      </dd>
    </div>
  );
}
