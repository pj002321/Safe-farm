import type { ReactNode } from "react";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { GrowthGauge } from "@/components/shared/GrowthGauge";
import { Reveal } from "@/components/shared/Reveal";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
import { listTaskCards } from "@/features/dashboard/taskStore";
import { aiService, type PlotReport } from "@/shared/aiService/client";

export function ReportFallback() {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <SatelliteScan compact labelKo="AI 리포트를 만드는 중" />
    </div>
  );
}

const NO_GROWTH_MESSAGE =
  "이 밭에 기르는 중인 작물이 없거나 근처 관측소를 찾지 못해 리포트를 만들 수 없습니다.";
const GENERATION_FAILED_MESSAGE =
  "리포트 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";
const UNAVAILABLE_MESSAGE =
  "지금은 리포트를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.";

export async function ReportPanel({
  userId,
  plotId,
  plotNameKo,
}: {
  userId: string;
  plotId: string;
  plotNameKo: string | null;
}) {
  const [result, tasks] = await Promise.all([
    aiService.plotReport(userId, plotId),
    listTaskCards(userId).catch(() => []),
  ]);
  const openTaskCount = tasks.filter(
    (t) => t.plotId === plotId && !t.done,
  ).length;

  if (!result.ok) {
    console.error(
      "[report] 밭 리포트 조회 실패",
      plotId,
      result.reason,
      result.detail,
    );
    return <NoticeBox>{UNAVAILABLE_MESSAGE}</NoticeBox>;
  }

  const report = result.data;
  if (!report.available) {
    if (report.reason === "NO_GROWTH_DATA")
      return <NoticeBox>{NO_GROWTH_MESSAGE}</NoticeBox>;
    return <NoticeBox>{GENERATION_FAILED_MESSAGE}</NoticeBox>;
  }

  // 위에서 아래로 순서대로 나타나게 지연을 40ms씩 늘려 준다 — 값이 한꺼번에
  // 뚝 떨어지지 않고 근거가 쌓이는 순서(특보 → 밭 → 게이지 → 조언 → 오늘 날씨)로 읽힌다.
  let step = 0;
  const nextDelay = () => step++ * 40;

  return (
    <div className="flex flex-col gap-4">
      {report.warnings && report.warnings.length > 0 && (
        <Reveal delay={nextDelay()}>
          <div className="flex gap-3 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3.5">
            <span aria-hidden="true" className="text-lg leading-tight">
              ☀
            </span>
            <div className="min-w-0">
              <b className="block font-semibold text-[0.95rem] text-fg">
                발효 중인 기상특보
              </b>
              <p className="mt-1 text-[0.85rem] text-fg-muted leading-relaxed">
                {report.warnings.join(" · ")}
              </p>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={nextDelay()}>
        <Card padding="md">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-[0.7rem] text-accent"
            >
              밭
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[1.05rem] text-fg">
                {plotNameKo ?? "이름 없는 밭"}
              </p>
              <p className="font-mono text-[0.7rem] text-fg-subtle">
                {report.cropNameKo}
              </p>
            </div>
            {report.stageName && (
              <Badge size="sm" tone="telemetry">
                {report.stageName}
              </Badge>
            )}
          </div>

          {report.gddTarget != null && (
            <Reveal
              className="mt-5 border-border border-t pt-5"
              delay={nextDelay()}
            >
              <GrowthGauge
                dayLabelKo={`파종 후 ${report.daysSincePlanting}일째`}
                footEndKo={`목표 ${report.gddTarget} GDD`}
                footStartKo="파종"
                markLabelKo="다음 단계"
                markRatio={
                  report.stageGddTo != null
                    ? Math.min(1, report.stageGddTo / report.gddTarget)
                    : null
                }
                revealed
                target={report.gddTarget}
                value={report.accumulatedGdd ?? 0}
              />
              {report.daysToTarget != null && (
                <p className="mt-2 text-[0.8rem] text-fg-subtle">
                  {report.daysToTarget === 0
                    ? "목표 GDD에 이미 도달했습니다."
                    : `최근 생육 속도로는 목표까지 약 ${report.daysToTarget}일 남았습니다.`}
                </p>
              )}
            </Reveal>
          )}

          <div className="mt-5 flex flex-col gap-2.5 border-border border-t pt-5">
            <Reveal delay={nextDelay()}>
              <p className="text-[0.9rem] text-fg leading-relaxed">
                {report.summary}
              </p>
            </Reveal>
            {report.todos?.map((text) => (
              <Reveal delay={nextDelay()} key={text}>
                <p className="border-telemetry border-l-2 pl-3 text-[0.9rem] text-fg leading-relaxed">
                  {text}
                </p>
              </Reveal>
            ))}
            {report.cautions?.map((text) => (
              <Reveal delay={nextDelay()} key={text}>
                <p className="border-caution border-l-2 pl-3 text-[0.9rem] text-fg-muted leading-relaxed">
                  {text}
                </p>
              </Reveal>
            ))}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={nextDelay()}>
        <Card padding="md" title="오늘 밭 상태">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Metric
              labelKo="필요 수분"
              valueKo={
                report.waterNeedMm != null
                  ? `${report.waterNeedMm}mm`
                  : "정보 없음"
              }
            />
            <Metric
              labelKo="이레 강수"
              valueKo={
                report.rainfall7dMm != null
                  ? `${report.rainfall7dMm.toFixed(1)}mm`
                  : "관측 없음"
              }
            />
            <Metric
              labelKo="내일 기온"
              valueKo={
                report.tomorrowTempMin != null && report.tomorrowTempMax != null
                  ? `${report.tomorrowTempMin.toFixed(1)} – ${report.tomorrowTempMax.toFixed(1)}℃`
                  : "예보 없음"
              }
            />
            <Metric
              labelKo="내일 강수확률"
              valueKo={
                report.tomorrowRainChance != null
                  ? `${report.tomorrowRainChance}%`
                  : "예보 없음"
              }
            />
          </dl>
        </Card>
      </Reveal>

      {report.forecastWeek && report.forecastWeek.length > 0 && (
        <Reveal delay={nextDelay()}>
          <Card padding="md" title="주간 예보">
            <div className="flex gap-2 overflow-x-auto">
              {report.forecastWeek.map((day) => (
                <div
                  className="flex min-w-16 flex-col items-center gap-1 rounded-lg border border-border px-2 py-2"
                  key={day.date}
                >
                  <span className="font-mono text-[0.65rem] text-fg-subtle">
                    {day.date.slice(5)}
                  </span>
                  <span className="font-mono text-[0.8rem] text-fg tabular-nums">
                    {day.temp_min != null ? Math.round(day.temp_min) : "–"}° /{" "}
                    {day.temp_max != null ? Math.round(day.temp_max) : "–"}°
                  </span>
                  <span className="font-mono text-[0.7rem] text-telemetry tabular-nums">
                    {day.rain_chance != null ? `${day.rain_chance}%` : "–"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {report.gddTrend && report.gddTrend.length > 0 && (
        <Reveal delay={nextDelay()}>
          <Card padding="md" title="최근 생육 속도(일일 GDD)">
            <GddTrendChart trend={report.gddTrend} />
          </Card>
        </Reveal>
      )}

      <Reveal delay={nextDelay()}>
        <a
          className="block rounded-lg border border-border px-4 py-3 text-[0.85rem] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          href="/dashboard"
        >
          이 밭에 남은 할 일 {openTaskCount}건 보기 →
        </a>
      </Reveal>
    </div>
  );
}

function GddTrendChart({
  trend,
}: {
  trend: NonNullable<PlotReport["gddTrend"]>;
}) {
  const max = Math.max(...trend.map((d) => d.gdd), 1);
  return (
    <div className="flex h-20 items-end gap-1">
      {trend.map((day) => (
        <div
          className="min-w-[6px] flex-1 rounded-t bg-telemetry/60"
          key={day.date}
          style={{ height: `${Math.max(4, (day.gdd / max) * 100)}%` }}
          title={`${day.date}: ${day.gdd} GDD`}
        />
      ))}
    </div>
  );
}

function NoticeBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border border-dashed bg-surface-2/40 p-4 text-fg-muted text-sm">
      {children}
    </div>
  );
}

function Metric({ labelKo, valueKo }: { labelKo: string; valueKo: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.65rem] text-fg-subtle uppercase tracking-[0.12em]">
        {labelKo}
      </dt>
      <dd className="mt-1 font-mono text-[0.9rem] text-fg tabular-nums">
        {valueKo}
      </dd>
    </div>
  );
}
