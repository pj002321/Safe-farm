import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiaryExportButton } from "@/components/cultivation/DiaryExportButton";
import { EndCultivationForm } from "@/components/cultivation/EndCultivationForm";
import { HarvestSummaryCard } from "@/components/cultivation/HarvestSummaryCard";
import { ObservationForm } from "@/components/cultivation/ObservationForm";
import { RecordTimeline } from "@/components/cultivation/RecordTimeline";
import { StageAddForm } from "@/components/cultivation/StageAddForm";
import { StageOverrideForm } from "@/components/cultivation/StageOverrideForm";
import { StageTimeline } from "@/components/cultivation/StageTimeline";
import { TaskAdviceList } from "@/components/cultivation/TaskAdviceList";
import { Card } from "@/components/shared/Card";
import { GrowthGauge } from "@/components/shared/GrowthGauge";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { loadCultivationDetail } from "@/features/cultivations/detailStore";
import { cardTitle } from "@/features/cultivations/domain/cultivationCard";
import { summarizeWeather } from "@/features/monitoring/domain/weatherSeries";
import {
  loadForecastTemps,
  loadWeatherSeries,
} from "@/features/monitoring/weatherStore";
import { getPlotDetail } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";
import { harvestCultivation } from "../../actions";
import {
  addObservation,
  addStage,
  completeTask,
  failCultivation,
  overrideStage,
  removeEvent,
} from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 재배 상세  →  /plots/[id]/cultivations/[cultivationId]
 *
 * [Description]
 * - 밭 상세의 작물 카드가 닿는 곳. 게이지 하나로는 "지금 뭘 해야 하나"를 못
 *   말해서, 단계 타임라인 · 할 일 · 도달 예측 · 기록을 한 화면에 모았다.
 * - 조회는 두 갈래다. 재배 쪽은 `loadCultivationDetail()` 이 한 번에 모으고,
 *   기상 요약은 `features/monitoring` 이 따로 읽어 **여기서 합친다** — features
 *   끼리는 import 할 수 없다(AGENTS.md).
 * - 오늘 날짜를 서버에서 한 번 정해 내려보낸다(`kstDateString()`). 컴포넌트가
 *   각자 `new Date()` 를 읽으면 서버와 브라우저가 다른 날을 그린다.
 * - 수확은 밭 상세의 액션(`../../actions`)을 그대로 쓴다. 같은 일을 두 벌로
 *   두면 한쪽만 고쳐진다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "재배 상세" };

export default async function Page({
  params,
  searchParams,
}: PageProps<"/plots/[id]/cultivations/[cultivationId]">) {
  const { id, cultivationId } = await params;

  const profile = await getCurrentProfile();
  const plot = profile ? await getPlotDetail(profile.id, id) : null;
  if (!plot) notFound();

  const today = kstDateString();
  // 차트용 계열과 도달 예측용 예보는 보는 기간이 달라 따로 읽는다. 둘 다
  // `features/monitoring` 이라 서로를 기다릴 이유가 없어 나란히 받는다.
  const [weather, forecast] = await Promise.all([
    loadWeatherSeries(plot, today),
    loadForecastTemps(plot, today).catch((error) => {
      // 예보가 없으면 평년값만으로 메운다. 예측 하나 때문에 화면을 죽이지 않는다.
      console.error("[cultivation] 예보 조회 실패", error);
      return [];
    }),
  ]);
  const detail = await loadCultivationDetail(
    plot,
    cultivationId,
    today,
    summarizeWeather(weather.series),
    forecast,
  );
  if (!detail) notFound();

  const { card, gauge, summary } = detail;
  const ended = card.status === "HARVESTED" || card.status === "FAILED";
  const stageNames = Object.fromEntries(
    detail.stages.map((stage) => [stage.stageOrder, stage.stageNameKo]),
  );

  const { error, saved } = await searchParams;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description={`${plot.nameKo ?? plot.regionKo} · ${card.sowingDate ?? "파종일 미정"} 시작`}
        title={cardTitle(card)}
      />

      {typeof error === "string" && (
        <p
          className="rounded-lg border border-unsuitable/25 bg-unsuitable/5 px-4 py-3 text-sm text-unsuitable"
          role="alert"
        >
          {error}
        </p>
      )}

      {typeof saved === "string" && (
        <p className="rounded-lg border border-good/25 bg-good/5 px-4 py-3 text-good text-sm">
          기록했습니다.
        </p>
      )}

      {summary !== null && (
        <Card title="마친 재배">
          <HarvestSummaryCard
            failureReason={card.failureReason}
            summary={summary}
          />
        </Card>
      )}

      {gauge !== null && (
        <Card title="생육 진행">
          <div className="flex flex-col gap-4">
            <GrowthGauge
              dayLabelKo={`관측 ${gauge.coveredDays}일 / ${gauge.expectedDays}일`}
              footEndKo={`목표 ${gauge.targetGdd}℃·일`}
              footStartKo={detail.stationNameKo ?? "관측소 없음"}
              markLabelKo={gauge.stage?.stageNameKo ?? "수확기"}
              markRatio={gauge.markRatio}
              revealed
              target={gauge.targetGdd}
              value={gauge.accumulatedGdd}
            />

            {detail.nextStage !== null && (
              <p className="text-fg-muted text-sm">
                {detail.nextStage.forecast.arrivalDate === null
                  ? `다음 단계(${detail.nextStage.stageNameKo}) 도달일은 아직 내다볼 수 없습니다.`
                  : `다음 단계(${detail.nextStage.stageNameKo})까지 ${detail.nextStage.forecast.daysLeft}일 — ${detail.nextStage.forecast.arrivalDate} 예상${detail.nextStage.forecast.extrapolated ? " (추정)" : ""}`}
              </p>
            )}

            {detail.harvest !== null && detail.harvest.arrivalDate !== null && (
              <p className="text-fg-muted text-sm">
                수확 예상 {detail.harvest.arrivalDate}
                {detail.harvest.extrapolated ? " (추정)" : ""}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card title="생육 단계">
        <div className="flex flex-col gap-4">
          <StageTimeline steps={detail.stageSteps} />
          {!ended && (
            <StageOverrideForm
              cultivationId={card.id}
              currentStageOrder={gauge?.stage?.stageOrder ?? null}
              onSubmit={overrideStage}
              plotId={plot.id}
              stages={detail.stages}
              today={today}
            />
          )}
          {!ended && (
            <StageAddForm
              cultivationId={card.id}
              onSubmit={addStage}
              plotId={plot.id}
              today={today}
            />
          )}
        </div>
      </Card>

      {!ended && (
        <Card title="이번 주 할 일">
          <TaskAdviceList
            cultivationId={card.id}
            currentStageOrder={gauge?.stage?.stageOrder ?? null}
            onDone={completeTask}
            plotId={plot.id}
            tasks={detail.tasks}
          />
        </Card>
      )}

      {!ended && (
        <Card title="관찰 기록">
          <ObservationForm
            cultivationId={card.id}
            currentStageOrder={gauge?.stage?.stageOrder ?? null}
            onSubmit={addObservation}
            plotId={plot.id}
            today={today}
          />
        </Card>
      )}

      <Card title="지나온 기록">
        <div className="flex flex-col gap-4">
          <RecordTimeline
            cultivationId={card.id}
            entries={detail.entries}
            onRemove={removeEvent}
            plotId={plot.id}
            stageNames={stageNames}
          />
          <DiaryExportButton />
        </div>
      </Card>

      {!ended && (
        <Card title="재배 끝내기">
          <EndCultivationForm
            cultivationId={card.id}
            onFail={failCultivation}
            onHarvest={harvestCultivation}
            plotId={plot.id}
          />
        </Card>
      )}
    </main>
  );
}
