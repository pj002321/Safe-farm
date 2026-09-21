import { SirenIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listCultivationCards } from "@/features/cultivations/cultivationStore";
import { loadPlotGrowth } from "@/features/cultivations/growthStore";
import { summarizeWeather } from "@/features/monitoring/domain/weatherSeries";
import { loadWeatherSeries } from "@/features/monitoring/weatherStore";
import { getDemoPlot } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { dailyGdd } from "@/shared/growth/gdd";
import { type TaskTone, weatherTasks } from "@/shared/growth/taskAdvice";
import { kstDateString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 상주 섹션 (#today)
 *
 * [Description]
 * - 지금 이 순간의 실측값 한 판. 전부 `is_demo = true` 로 표시한 실제 밭
 *   한 곳(`getDemoPlot()`)에서 계산한다 — 화면에 숫자를 직접 적으면
 *   "꾸며낸 숫자가 하나도 없다"는 문장이 거짓이 된다.
 * - 경보 박스는 `weatherTasks()`(밭 상세와 같은 규칙)가 낸 첫 항목을 그대로
 *   쓴다. 관측이 사흘 미만이거나 특이사항이 없으면 항목이 비어 박스째 안 그린다.
 * - 서버 컴포넌트다. 상호작용이 없으므로 등장 연출만 `Reveal` 에 맡긴다.
 *
 * [Usage]
 * ```tsx
 * <TodayInSangju />
 * ```
 * ---------------------------------------------
 */

const MONO = "font-mono tabular-nums";

const ALERT_TONE: Record<TaskTone, string> = {
  info: "border-info bg-info/5",
  caution: "border-caution bg-caution/5",
  unsuitable: "border-unsuitable bg-unsuitable/5",
};

export async function TodayInSangju() {
  const plot = await getDemoPlot();
  const today = kstDateString();
  const cards = plot ? await listCultivationCards(plot.id) : [];

  const [growth, weather, forecast] = plot
    ? await Promise.all([
        loadPlotGrowth(plot, cards, today),
        loadWeatherSeries(plot, today, 7, 6),
        // ⚠ plot_id·user_id 를 넘기지 말 것. 좌표만으로 부른다 —
        //   ① 랜딩은 비로그인이라 소유권을 댈 수 없고
        //   ② URL 에 plot_id 가 들어가면 Next Data Cache 가 밭별로 쪼개진다.
        //   좌표만 보내면 밭에 딸린 값(작물 해석·특보)은 안 오는데, 이 섹션은
        //   그것들을 자기 DB 조회로 이미 갖고 있다.
        aiService.plotForecast(plot.latitude, plot.longitude),
      ])
    : [null, null, null];

  const todayPoint = weather?.series.points.find(
    (point) => point.date === today && point.source === "observed",
  );
  const summary = weather ? summarizeWeather(weather.series) : null;
  const card = cards[0] ?? null;
  const gauge = growth?.growths[0]?.gauge ?? null;
  
  /** 오늘 예보 한 줄. ai-service 가 죽었거나 오늘이 없으면 null. */
  const todayForecast =
    forecast?.ok === true
      ? (forecast.data.days.find((day) => day.date === today) ?? null)
      : null;

  /**
   * 오늘 기온 — **관측이 먼저, 없으면 예보다.**
   *
   * 기상청 일통계는 하루가 끝나야 확정돼 오늘 행이 거의 늘 비어 있다. 일반 밭
   * 화면이 그 자리를 Open-Meteo 로 채우는 것과 **같은 선**을 여기에도 잇는다.
   * 관측이 들어온 뒤에는 관측이 이긴다 — 같은 날 두 값이 다르면 잰 쪽이 맞다.
   */
  const todayMinC = todayPoint?.tempMinC ?? todayForecast?.tempMin ?? null;
  const todayMaxC = todayPoint?.tempMaxC ?? todayForecast?.tempMax ?? null;

  const todayGdd =
    todayMaxC != null && todayMinC != null && card?.baseTempC != null
      ? dailyGdd(
          todayMaxC,
          todayMinC,
          card.baseTempC,
          card.upperTempC ?? undefined,
        )
      : null;

  const METRICS: readonly { value: string; labelKo: string }[] = [
    {
      value:
        todayMinC != null && todayMaxC != null
          ? `${todayMinC.toFixed(1)} – ${todayMaxC.toFixed(1)}`
          : "—",
      labelKo: "오늘 기온 ℃",
    },
    {
      value: summary?.rainfallMm != null ? summary.rainfallMm.toFixed(1) : "—",
      labelKo: "이레 강수 mm",
    },
    {
      value: todayGdd !== null ? todayGdd.toFixed(1) : "—",
      labelKo: "하루 적산 GDD",
    },
    { value: gauge?.stage?.stageNameKo ?? "—", labelKo: "생육단계" },
    {
      value: gauge?.daysLeft != null ? `${gauge.daysLeft}일` : "—",
      labelKo: "수확까지",
    },
  ];

  const advice = weatherTasks(summary)[0] ?? null;

  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32"
      id="today"
    >
      <SectionHeading
        description="꾸며낸 숫자가 하나도 없습니다. 기상청 관측소에서 받은 실측과 농진청 기준으로 계산한 결과입니다."
        eyebrow="오늘 상주"
        title="지금 이 순간의 값입니다"
      />

      <Reveal className="mt-10">
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-6 py-4">
            <p className="font-medium text-fg text-sm">
              {plot
                ? `${plot.regionKo} · ${weather?.stationNameKo ?? "관측소 정보 없음"}`
                : "데모 밭 준비 중"}
            </p>
            <p className={`text-fg-subtle text-xs ${MONO}`}>{today}</p>
          </div>

          <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
            {METRICS.map((metric) => (
              <div className="bg-surface px-6 py-5" key={metric.labelKo}>
                <dd className={`text-fg text-xl sm:text-2xl ${MONO}`}>
                  {metric.value}
                </dd>
                <dt className="mt-1 text-fg-muted text-xs">{metric.labelKo}</dt>
              </div>
            ))}
          </dl>

          {advice && (
            <div className={`border-l-2 px-6 py-5 ${ALERT_TONE[advice.tone]}`}>
              <Badge
                icon={<SirenIcon className="size-3.5" />}
                size="sm"
                tone={advice.tone}
              >
                {advice.titleKo}
              </Badge>
              <p className="mt-3 text-pretty text-fg-muted text-sm leading-relaxed">
                {advice.whyKo}
              </p>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}
